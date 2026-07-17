// Consolidates every scraped source in scripts/out/ into ONE dossier per person
// (scripts/out/dossiers.json) so later passes can extract structured data
// (education, professional experience) from all of a person's bios side by side.
//
// Identity clustering, strongest first:
//   1. mzalendo slug equality across the mzalendo per-parliament files.
//   2. Same parliament + seat type + region (slugified) across sources, with
//      name-token overlap >= 1 — never seat alone (by-elections mean one seat
//      can be held by different people across sources).
//   3. Cross-parliament / cross-source: name-token overlap >= 2 with a unique
//      best cluster; ties stay separate and are listed in possibleDuplicates.
//   4. Read-only DB attachment: platformSlug + userId via the 13th-parliament
//      seat's current holder, else a unique >= 2-token name match.
//
// Idempotent and deterministic (stable ordering, no timestamps in the output);
// tolerates missing/partial input files (the crawler rewrites them live).
// Run: bun run scripts/build-dossiers.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { leaders, positions, users } from '../src/lib/server/db/schema';
import { slugify } from './lib/names';

const OUT_DIR = join(import.meta.dir, 'out');

// ---------- input shapes ----------

type MzEntry = {
	slug: string;
	url: string;
	name: string;
	constituency: string | null;
	county: string | null;
	party: string | null; // FULL party name
	status: string | null; // Elected | Nominated | Women's Representative
	bio: string | null;
	photoUrl: string | null;
	committees?: string[];
};

type WikiEntry = {
	name: string;
	seat: 'MP' | 'Woman Rep' | 'Senator';
	region: string;
	party: string | null; // abbreviation
	articleUrl: string | null;
	bio: string | null;
	photoUrl: string | null;
};

type RosterEntry = {
	name: string; // SURNAME-first
	seat: 'MP' | 'Senator';
	region: string;
	county: string;
	party: string | null; // abbreviation
	sourceUrl: string;
	note?: string;
	mzalendo?: {
		status: string;
		url?: string;
		name?: string;
		email?: string;
		phone?: string;
		links?: string[];
		fetchedAt?: string;
	};
};

// ---------- internal record + cluster shapes ----------

// Every contact keeps its provenance: the seeder writes contacts.source from this,
// so dossiers.json alone must carry everything the trust model needs.
type ContactFact = { value: string; url: string | null; publisher: string; fetchedAt: string | null };
type Contacts = { emails: ContactFact[]; phones: ContactFact[]; links: ContactFact[] };

type Rec = {
	source: string; // 'mzalendo-13th', 'wikipedia-9th', 'roster', 'non-elected', 'wikipedia-executive', ...
	// Cycle label, the generalized "which election/term is this sighting about":
	// parliaments ('13th'...'8th') for legislators, 'gov-2013'/'gov-2017' for past
	// governor cycles, 'exec-2022' for sitting executives, 'pres-<start year>' for
	// presidencies, 'pres-2027' for declared candidates. MCA cycles slot in the
	// same way ('mca-2022'). One seat per label per person (conflict guard).
	parliament: string | null;
	seat: string | null; // MP | Woman Rep | Senator | Nominated | Governor | President
	region: string | null;
	name: string;
	altNames: string[]; // extra name forms (roster's mzalendo name, earlier-slug evidence)
	party: string | null;
	partyIsFullName: boolean;
	bio: string | null;
	photoUrl: string | null;
	committees: string[];
	url: string | null; // per-term source page
	contacts: Contacts;
	note: string | null;
	mzSlug: string | null; // slug for rule-1 equality (null for the 'earlier' file)
	termStart?: string | null; // ISO dates when the source asserts them (executive/governor cycles)
	termEnd?: string | null;
	platformSlugHint?: string | null; // source-provided platform slug (kiongozi, county portraits)
	// false = never join by seat identity (rule 2). By-election sources put TWO
	// different people on one seat key per parliament (the vacated holder and the
	// winner, often relatives sharing a name token), so seat+1-token is unsafe.
	seatJoin?: boolean;
	rawProfile?: { education: unknown[]; experience: unknown[] } | null; // kiongozi civic blurbs, verbatim
};

type Cluster = {
	id: number;
	records: Rec[];
	tokens: Set<string>;
	possibleDuplicateOf: Cluster | null;
	duplicateSharedTokens: number;
};

// Wikipedia cells occasionally leak HTML entities and cite-template markup into
// names ("David Ouma Ochieng&#x27;", "Chris Karan (2017–18) {{cite web|…").
function cleanName(name: string): string {
	return name
		.replace(/&#x27;|&#39;|&rsquo;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/\{\{[\s\S]*$/, '') // cite templates and everything after
		.replace(/&lt;[\s\S]*$/, '')
		.replace(/<[\s\S]*$/, '')
		.replace(/\s+/g, ' ')
		.trim();
}

// Honorifics never identify a person and would inflate token overlap.
const TOKEN_STOPLIST = new Set(['hon', 'the', 'prof', 'eng', 'amb', 'sen', 'gen', 'maj', 'col', 'bishop', 'rev', 'cpa', 'cbs', 'egh', 'mgh']);

// Name tokens: lowercase, strip non-letters (apostrophes REMOVED so "Ng'ang'a"
// matches "Nganga"), drop <= 2 chars. Jr/Sr suffixes normalize to junior/senior
// and are KEPT: they are the only thing distinguishing a father and son who share
// every other name (Mutula Kilonzo Sr/Jr). Patronymic particles that sources
// space inconsistently ("Ole Kina" vs "Olekina") expand to BOTH forms so either
// spelling overlaps the other.
const PARTICLES = ['ole'];
function nameTokens(name: string): string[] {
	const raw = name
		.toLowerCase()
		.replace(/[''’]/g, '')
		.replace(/[^a-z\s-]/g, ' ')
		.split(/\s+/)
		.map((t) => (t === 'jr' || t === 'jnr' ? 'junior' : t === 'sr' || t === 'snr' ? 'senior' : t))
		.filter(Boolean);
	const out = new Set<string>();
	for (let i = 0; i < raw.length; i++) {
		const t = raw[i];
		if (PARTICLES.includes(t) && raw[i + 1]) out.add(t + raw[i + 1]); // "ole kina" -> olekina
		for (const p of PARTICLES) {
			if (t.startsWith(p) && t.length > p.length + 2) out.add(t.slice(p.length)); // "olekina" -> kina
		}
		out.add(t);
	}
	return [...out].filter((t) => t.replace(/[^a-z]/g, '').length > 2 && !TOKEN_STOPLIST.has(t));
}

function clusterTokens(c: Cluster): Set<string> {
	return c.tokens;
}

function recordTokens(r: Rec): Set<string> {
	const set = new Set<string>();
	for (const n of [r.name, ...r.altNames]) for (const t of nameTokens(n)) set.add(t);
	return set;
}

function overlap(a: Set<string>, b: Set<string>): number {
	let n = 0;
	for (const t of a) if (b.has(t)) n++;
	return n;
}

// ---------- load inputs (each file optional; skip unreadable/partial ones) ----------

function loadArray<T>(file: string): T[] | null {
	const path = join(OUT_DIR, file);
	if (!existsSync(path)) {
		console.log(`[dossiers] ${file}: missing — skipped`);
		return null;
	}
	try {
		const parsed = JSON.parse(readFileSync(path, 'utf8'));
		if (!Array.isArray(parsed)) throw new Error('not an array');
		return parsed as T[];
	} catch (err) {
		console.log(`[dossiers] ${file}: unreadable (${(err as Error).message}) — skipped`);
		return null;
	}
}

const records: Rec[] = [];
const emptyContacts = (): Contacts => ({ emails: [], phones: [], links: [] });

// Roster rows for seats between holders are literal "Vacant" placeholders.
const isPlaceholderName = (name: string) => /^vacant\b/i.test(name.trim());

// mzalendo per-parliament files. The 'earlier' file's slugs end in -8th/-9th/-10th:
// the suffix names the parliament and the rest is name evidence, so those slugs
// never join rule 1 (each parliament page gets its own slug there).
const MZ_FILES = [
	{ file: 'scraped-mps-13th.json', parliament: '13th' as string | null, senate: false },
	{ file: 'scraped-mps-12th.json', parliament: '12th' as string | null, senate: false },
	{ file: 'scraped-mps-11th.json', parliament: '11th' as string | null, senate: false },
	{ file: 'scraped-mps-earlier.json', parliament: null, senate: false },
	// Senate renders: an "Elected" member's county IS their seat.
	{ file: 'scraped-mps-senate-13th.json', parliament: '13th' as string | null, senate: true },
	{ file: 'scraped-mps-senate-12th.json', parliament: '12th' as string | null, senate: true },
	{ file: 'scraped-mps-senate-11th.json', parliament: '11th' as string | null, senate: true }
];
for (const { file, parliament, senate } of MZ_FILES) {
	const entries = loadArray<MzEntry>(file);
	if (!entries) continue;
	let skippedNameless = 0;
	for (const e of entries) {
		if (!e.name?.trim() || isPlaceholderName(e.name)) {
			skippedNameless++;
			continue;
		}
		let entryParliament = parliament;
		let mzSlug: string | null = e.slug;
		const altNames: string[] = [];
		if (!parliament) {
			// earlier file: parliament from the slug suffix, slug body as name evidence
			const m = /^(.*?)-(8th|9th|10th)$/.exec(e.slug ?? '');
			if (!m) continue;
			entryParliament = m[2];
			mzSlug = null;
			altNames.push(m[1].replace(/-/g, ' '));
		}
		let seat: string | null = null;
		let region: string | null = null;
		if (senate) {
			if (/nominated/i.test(e.status ?? '')) {
				seat = 'Nominated';
			} else if (e.county) {
				seat = 'Senator';
				region = e.county;
			}
		} else if (/nominated/i.test(e.status ?? '')) {
			seat = 'Nominated';
		} else if (/women/i.test(e.status ?? '') && e.county) {
			seat = 'Woman Rep';
			region = e.county;
		} else if (e.constituency) {
			seat = 'MP';
			region = e.constituency;
		} else if (/elected/i.test(e.status ?? '')) {
			// The 8th-10th member pages carry no constituency fact — keep the term
			// with a null region rather than dropping the sighting entirely.
			seat = 'MP';
		}
		records.push({
			source: `mzalendo-${entryParliament}`,
			parliament: entryParliament,
			seat,
			region,
			name: cleanName(e.name),
			altNames,
			party: e.party,
			partyIsFullName: true,
			bio: e.bio,
			photoUrl: e.photoUrl,
			committees: e.committees ?? [],
			url: e.url ?? null,
			contacts: emptyContacts(),
			note: null,
			mzSlug
		});
	}
	if (skippedNameless) console.log(`[dossiers] ${file}: ${skippedNameless} nameless entries skipped`);
}

// wikipedia per-parliament files
for (const parliament of ['13th', '12th', '11th', '9th']) {
	const entries = loadArray<WikiEntry>(`scraped-wikipedia-${parliament}.json`);
	if (!entries) continue;
	for (const e of entries) {
		const name = cleanName(e.name ?? '');
		if (!name || isPlaceholderName(name)) continue;
		// The 11th-parliament table leaks its row number into region for most rows
		// ("1", "255"); a numeric region is never a real constituency.
		const region = e.region && !/^\d+$/.test(e.region.trim()) ? e.region : null;
		records.push({
			source: `wikipedia-${parliament}`,
			parliament,
			seat: e.seat,
			region,
			name,
			altNames: [],
			party: e.party,
			partyIsFullName: false,
			bio: e.bio,
			photoUrl: e.photoUrl,
			committees: [],
			url: e.articleUrl,
			contacts: emptyContacts(),
			note: null,
			mzSlug: null
		});
	}
}

// parliament.go.ke roster (13th only) + nominated members
for (const { file, source, nominated } of [
	{ file: 'scraped-roster.json', source: 'roster', nominated: false },
	{ file: 'non-elected.json', source: 'non-elected', nominated: true }
]) {
	const entries = loadArray<RosterEntry>(file);
	if (!entries) continue;
	for (const e of entries) {
		if (!e.name?.trim() || isPlaceholderName(e.name)) continue;
		const mz = e.mzalendo?.status === 'found' ? e.mzalendo : null;
		// parliament.go.ke's MP table hides Woman Reps: their "constituency" cell is
		// their county. (Senators legitimately have region == county.)
		const seat = e.seat === 'MP' && e.county && slugify(e.region ?? '') === slugify(e.county) ? 'Woman Rep' : e.seat;
		records.push({
			source,
			parliament: '13th',
			seat: nominated ? 'Nominated' : seat,
			region: nominated ? null : e.region || null,
			name: cleanName(e.name),
			altNames: mz?.name ? [cleanName(mz.name)] : [],
			party: e.party,
			partyIsFullName: false,
			bio: null,
			photoUrl: null,
			committees: [],
			url: e.sourceUrl ?? null,
			contacts: {
				emails: mz?.email ? [{ value: mz.email, url: mz.url ?? null, publisher: 'info.mzalendo.com', fetchedAt: mz.fetchedAt ?? null }] : [],
				phones: mz?.phone ? [{ value: mz.phone, url: mz.url ?? null, publisher: 'info.mzalendo.com', fetchedAt: mz.fetchedAt ?? null }] : [],
				links: (mz?.links ?? []).map((l) => ({ value: l, url: mz?.url ?? null, publisher: 'info.mzalendo.com', fetchedAt: mz?.fetchedAt ?? null }))
			},
			note: nominated ? (e.note ?? 'Nominated') : null,
			mzSlug: null
		});
	}
}

// Executive + governor sources share one record shape; this trims the boilerplate.
function execRec(
	partial: Pick<Rec, 'source' | 'parliament' | 'seat' | 'region' | 'name'> & Partial<Rec>
): Rec {
	return {
		altNames: [],
		party: null,
		partyIsFullName: false,
		bio: null,
		photoUrl: null,
		committees: [],
		url: null,
		contacts: emptyContacts(),
		note: null,
		mzSlug: null,
		...partial
	};
}

// Wikipedia executive scrape: sitting president + governors ('exec-2022') and the
// former presidencies, each presidency its own cycle label ('pres-1964', ...).
type ExecEntry = {
	name: string;
	seat: 'President' | 'Governor';
	region: string;
	status: 'current' | 'former';
	termStart: string | null;
	termEnd: string | null;
	articleUrl: string | null;
	bio: string | null;
	photoUrl: string | null;
};
for (const e of loadArray<ExecEntry>('scraped-wikipedia-executive.json') ?? []) {
	if (!e.name?.trim()) continue;
	const label = e.status === 'former' && e.termStart ? `pres-${e.termStart.slice(0, 4)}` : 'exec-2022';
	records.push(
		execRec({
			source: 'wikipedia-executive',
			parliament: label,
			seat: e.seat,
			region: e.region,
			name: cleanName(e.name),
			bio: e.bio,
			photoUrl: e.photoUrl,
			url: e.articleUrl,
			termStart: e.termStart,
			termEnd: e.termEnd
		})
	);
}

// Past governor cycles (2013/2017 winners + mid-term successors).
type PastGovEntry = {
	name: string;
	county: string;
	cycle: '2013' | '2017';
	party: string | null;
	termStart: string;
	termEnd: string;
	note?: string;
	articleUrl: string | null;
	bio: string | null;
	photoUrl: string | null;
};
for (const e of loadArray<PastGovEntry>('scraped-wikipedia-governors-past.json') ?? []) {
	if (!e.name?.trim()) continue;
	records.push(
		execRec({
			source: 'wikipedia-govpast',
			parliament: `gov-${e.cycle}`,
			seat: 'Governor',
			region: e.county,
			name: cleanName(e.name),
			party: e.party,
			bio: e.bio,
			photoUrl: e.photoUrl,
			url: e.articleUrl,
			note: e.note ?? null,
			termStart: e.termStart,
			termEnd: e.termEnd
		})
	);
}

// Council of Governors + county-site portraits: photo evidence for sitting governors.
for (const e of loadArray<{ county: string; name: string; photoUrl: string }>('scraped-cog-governors.json') ?? []) {
	if (!e.name?.trim()) continue;
	records.push(
		execRec({
			source: 'cog',
			parliament: 'exec-2022',
			seat: 'Governor',
			region: e.county,
			name: cleanName(e.name),
			photoUrl: e.photoUrl,
			url: 'https://cog.go.ke/current-governors/'
		})
	);
}
for (const e of loadArray<{ slug: string; name: string; county: string; photoUrl: string; publisher: string }>(
	'scraped-county-portraits.json'
) ?? []) {
	if (!e.name?.trim()) continue;
	records.push(
		execRec({
			source: 'county-site',
			parliament: 'exec-2022',
			seat: 'Governor',
			region: e.county,
			name: cleanName(e.name),
			photoUrl: e.photoUrl,
			url: null,
			note: e.publisher,
			platformSlugHint: e.slug
		})
	);
}

// kiongozi.online civic profiles: declared 2027 presidential candidates. The name
// comes from the platform slug (the source is keyed by slug, not display name);
// the raw education/experience blurbs ride along verbatim for downstream curation.
for (const e of loadArray<{
	kiongoziSlug: string;
	platformSlug: string;
	url: string;
	photoUrl: string | null;
	education: unknown[];
	experience: unknown[];
}>('scraped-kiongozi.json') ?? []) {
	records.push(
		execRec({
			source: 'kiongozi',
			parliament: 'pres-2027',
			seat: 'President',
			region: 'Kenya',
			name: cleanName(e.platformSlug.replace(/-/g, ' ').replace(/\b[a-z]/g, (ch) => ch.toUpperCase())),
			photoUrl: e.photoUrl,
			url: e.url,
			note: '2027 presidential candidate',
			platformSlugHint: e.platformSlug,
			rawProfile: { education: e.education, experience: e.experience }
		})
	);
}

// By-elections register: seats vacated mid-term since 2002 plus their by-election
// winners (curated CSV, wiki-enriched for photos). Labels are the parliament era
// the partial term sat in, so these merge with the person's other sightings; the
// CSV bio is kept verbatim and the vacancy reason rides as the term note.
type ByElectionEntry = {
	name: string;
	seat: string;
	region: string;
	party: string | null;
	cycle: string;
	termStartYear: number;
	termEndYear: number;
	reason: string;
	bio: string;
	articleUrl: string | null;
	photoUrl: string | null;
};
// Known alternate spellings from other sources, so the subset rule can merge
// (mzalendo writes "Benard Otieno Okoth" for Bernard Imran Okoth, etc.).
const BY_ELECTION_ALT_NAMES: Record<string, string[]> = {
	'Bernard Imran Okoth': ['Benard Otieno Okoth'],
	'Ken Okoth': ['Kenneth Okoth']
};
for (const e of loadArray<ByElectionEntry>('scraped-by-elections.json') ?? []) {
	if (!e.name?.trim()) continue;
	records.push(
		execRec({
			source: 'by-elections',
			parliament: e.cycle,
			seat: e.seat,
			region: e.region,
			name: cleanName(e.name),
			altNames: BY_ELECTION_ALT_NAMES[e.name] ?? [],
			party: e.party,
			bio: e.bio || null,
			photoUrl: e.photoUrl,
			url: e.articleUrl,
			note: e.reason,
			termStart: `${e.termStartYear}-01-01`,
			termEnd: e.termEndYear >= 2027 ? null : `${e.termEndYear}-12-31`,
			seatJoin: false
		})
	);
}

// ---------- clustering ----------

let clusterSeq = 0;
const clusters: Cluster[] = [];
const clusterBySlug = new Map<string, Cluster>();

function newCluster(r: Rec): Cluster {
	const c: Cluster = {
		id: ++clusterSeq,
		records: [r],
		tokens: recordTokens(r),
		possibleDuplicateOf: null,
		duplicateSharedTokens: 0
	};
	clusters.push(c);
	if (r.mzSlug) clusterBySlug.set(r.mzSlug, c);
	return c;
}

function addToCluster(c: Cluster, r: Rec): void {
	c.records.push(r);
	for (const t of recordTokens(r)) c.tokens.add(t);
	if (r.mzSlug && !clusterBySlug.has(r.mzSlug)) clusterBySlug.set(r.mzSlug, c);
}

function seatKey(r: Rec): string | null {
	if (!r.parliament || !r.seat || !r.region) return null;
	return `${r.parliament}|${r.seat}|${slugify(r.region)}`;
}

function clusterSeatKeys(c: Cluster): Set<string> {
	const keys = new Set<string>();
	for (const r of c.records) {
		const k = seatKey(r);
		if (k) keys.add(k);
	}
	return keys;
}

// One person holds one seat per parliament: a cluster already seated elsewhere
// in the record's parliament cannot be the same person.
function conflictsWithCluster(c: Cluster, recordKey: string): boolean {
	const parliament = recordKey.slice(0, recordKey.indexOf('|'));
	for (const k of clusterSeatKeys(c)) {
		if (k.startsWith(`${parliament}|`) && k !== recordKey) return true;
	}
	return false;
}

// rule 2: same parliament + seat + region across sources, name overlap >= 1;
// returns the unique best cluster or null (a tie falls through to rule 3).
function rule2Match(r: Rec): Cluster | null {
	const key = seatKey(r);
	if (!key) return null;
	const rTokens = recordTokens(r);
	const candidates = clusters
		.filter((c) => clusterSeatKeys(c).has(key))
		.map((c) => ({ c, score: overlap(rTokens, clusterTokens(c)) }))
		.filter((s) => s.score >= 1)
		.sort((a, b) => b.score - a.score || a.c.id - b.c.id);
	if (candidates.length === 1 || (candidates.length > 1 && candidates[0].score > candidates[1].score)) return candidates[0].c;
	return null;
}

// A bare 2-token overlap is only trustworthy when one side's tokens are a SUBSET
// of the other's ("Junet Mohamed" ⊆ "Junet Sheikh Nuh Mohamed"). When BOTH sides
// carry distinctive unmatched tokens ("Martha Wangari KARUA" vs "Martha Wangari
// WANJIRA", "Fatuma GEDI Ali" vs "Fatuma IBRAHIM Ali") they are namesakes, not
// the same person — three real mismerges shipped before this guard existed.
function subsetEitherWay(a: Set<string>, b: Set<string>): boolean {
	const aInB = [...a].every((t) => b.has(t));
	const bInA = [...b].every((t) => a.has(t));
	return aInB || bInA;
}

// rule 3 scoring: cross-parliament/source name overlap >= 2 (2-token matches
// additionally need the subset guard), clusters already seated elsewhere in the
// record's parliament excluded.
function rule3Scores(r: Rec): { c: Cluster; score: number }[] {
	const key = seatKey(r);
	const rTokens = recordTokens(r);
	return clusters
		.filter((c) => !key || !conflictsWithCluster(c, key))
		.map((c) => ({ c, score: overlap(rTokens, clusterTokens(c)) }))
		.filter((s) => s.score >= 3 || (s.score === 2 && subsetEitherWay(rTokens, clusterTokens(s.c))))
		.sort((a, b) => b.score - a.score || a.c.id - b.c.id);
}

// Sources are clustered one batch at a time in fixed priority order (mzalendo
// 13th -> earlier, wikipedia 13th -> 9th, roster, non-elected). Within a batch,
// rule 1 and rule 2 run first; the leftovers run rule 3 strongest-match-first so
// a person's own high-overlap record claims their cluster before a namesake's
// weaker 2-token match can squat in it.
const batches: Rec[][] = [];
for (const r of records) {
	const last = batches[batches.length - 1];
	if (last && last[0].source === r.source) last.push(r);
	else batches.push([r]);
}
for (const batch of batches) {
	const leftovers: Rec[] = [];
	for (const r of batch) {
		if (r.mzSlug && clusterBySlug.has(r.mzSlug)) {
			addToCluster(clusterBySlug.get(r.mzSlug)!, r); // rule 1: slug equality
			continue;
		}
		const bySeat = r.seatJoin === false ? null : rule2Match(r);
		if (bySeat) addToCluster(bySeat, r);
		else leftovers.push(r);
	}
	// rule 3, strongest first (initial score is only the processing order; every
	// record is re-scored at assignment time against the clusters as they stand)
	const queue = leftovers
		.map((r, i) => ({ r, i, score: rule3Scores(r)[0]?.score ?? 0 }))
		.sort((a, b) => b.score - a.score || a.i - b.i);
	for (const { r } of queue) {
		const scored = rule3Scores(r);
		if (scored.length === 1 || (scored.length > 1 && scored[0].score > scored[1].score)) {
			addToCluster(scored[0].c, r);
			continue;
		}
		const created = newCluster(r);
		if (scored.length > 1) {
			// tie — leave separate, flag for human review
			created.possibleDuplicateOf = scored[0].c;
			created.duplicateSharedTokens = scored[0].score;
		}
	}
}

// Cluster-merge pass: mzalendo slugs are NOT stable across parliament files in
// practice (e.g. shimbwa-omar / shimbwa-omar-1 / omar-mwinyi-shimbwa are one
// person), so re-apply rule 3 between whole clusters. Guard: never merge two
// clusters that hold different seats in the same parliament — one person cannot.
function seatConflict(a: Cluster, b: Cluster): boolean {
	const byParliament = new Map<string, Set<string>>();
	for (const r of a.records) {
		const k = seatKey(r);
		if (!k) continue;
		const [parliament] = k.split('|');
		byParliament.set(parliament, (byParliament.get(parliament) ?? new Set()).add(k));
	}
	for (const r of b.records) {
		const k = seatKey(r);
		if (!k) continue;
		const [parliament] = k.split('|');
		const seats = byParliament.get(parliament);
		if (seats && !seats.has(k)) return true;
	}
	return false;
}

const merged = new Set<number>();
for (const c of [...clusters].sort((a, b) => a.id - b.id)) {
	if (merged.has(c.id)) continue;
	const scored = clusters
		.filter((o) => o.id !== c.id && !merged.has(o.id))
		.map((o) => ({ o, score: overlap(clusterTokens(c), clusterTokens(o)) }))
		.filter(
			(s) =>
				(s.score >= 3 || (s.score === 2 && subsetEitherWay(clusterTokens(c), clusterTokens(s.o)))) &&
				!seatConflict(c, s.o)
		)
		.sort((a, b) => b.score - a.score || a.o.id - b.o.id);
	if (!scored.length) continue;
	if (scored.length === 1 || scored[0].score > scored[1].score) {
		const target = scored[0].o;
		for (const r of c.records) addToCluster(target, r);
		if (c.possibleDuplicateOf && !target.possibleDuplicateOf && c.possibleDuplicateOf !== target) {
			target.possibleDuplicateOf = c.possibleDuplicateOf;
			target.duplicateSharedTokens = c.duplicateSharedTokens;
		}
		merged.add(c.id);
	} else if (!c.possibleDuplicateOf) {
		c.possibleDuplicateOf = scored[0].o;
		c.duplicateSharedTokens = scored[0].score;
	}
}
const finalClusters = clusters.filter((c) => !merged.has(c.id));

// ---------- DB attachment (read-only) ----------

type DbUser = { userId: number; slug: string | null; name: string; tokens: Set<string> };
const holderByPositionKey = new Map<string, DbUser>(); // 'MP|slug-region' -> current holder
let leaderUsers: DbUser[] = [];

if (!process.env.DATABASE_URL) {
	console.log('[dossiers] DATABASE_URL not set — skipping DB attachment');
} else {
	const client = postgres(process.env.DATABASE_URL, { max: 1 });
	try {
		const db = drizzle(client);
		const positionRows = await db
			.select({ id: positions.id, title: positions.title, region: positions.region })
			.from(positions)
			.where(isNull(positions.deletedAt));
		const positionKeyById = new Map(positionRows.map((p) => [p.id, `${p.title}|${slugify(p.region)}`]));

		const toDbUser = (u: { userId: number; slug: string | null; firstName: string; otherNames: string }): DbUser => {
			const name = `${u.firstName} ${u.otherNames}`.trim();
			return { userId: u.userId, slug: u.slug, name, tokens: new Set(nameTokens(name)) };
		};

		const holderRows = await db
			.select({ positionId: leaders.positionId, userId: users.id, slug: users.slug, firstName: users.firstName, otherNames: users.otherNames })
			.from(leaders)
			.innerJoin(users, eq(leaders.userId, users.id))
			.where(and(eq(leaders.status, 'current'), isNull(leaders.deletedAt), isNull(users.deletedAt)))
			.orderBy(leaders.positionId, users.id);
		for (const h of holderRows) {
			const key = positionKeyById.get(h.positionId);
			if (key && !holderByPositionKey.has(key)) holderByPositionKey.set(key, toDbUser(h));
		}

		const leaderUserRows = await db
			.selectDistinct({ userId: users.id, slug: users.slug, firstName: users.firstName, otherNames: users.otherNames })
			.from(leaders)
			.innerJoin(users, eq(leaders.userId, users.id))
			.where(and(isNull(leaders.deletedAt), isNull(users.deletedAt)))
			.orderBy(users.id);
		leaderUsers = leaderUserRows.map(toDbUser);
		console.log(`[dossiers] db: ${leaderUsers.length} leader-users, ${holderByPositionKey.size} seated positions`);
	} catch (err) {
		console.log(`[dossiers] db unavailable (${(err as Error).message}) — skipping DB attachment`);
	} finally {
		await client.end();
	}
}

function attachDbUser(c: Cluster): DbUser | null {
	// (0) a source-provided platform slug (kiongozi, county portraits) is exact
	for (const r of c.records) {
		if (!r.platformSlugHint) continue;
		const hinted = leaderUsers.find((u) => u.slug === r.platformSlugHint);
		if (hinted) return hinted;
	}
	// (a) current holder of the cluster's current-cycle seat, name-corroborated
	for (const r of c.records) {
		if (r.parliament !== '13th' && r.parliament !== 'exec-2022') continue;
		const k = seatKey(r);
		if (!k) continue;
		const holder = holderByPositionKey.get(k.slice(k.indexOf('|') + 1));
		if (holder && overlap(holder.tokens, clusterTokens(c)) >= 1) return holder;
	}
	// (b) unique >= 2-token name match across every leader-user; 2-token matches
	// need the subset guard ("Mutula Kilonzo Sr." must never attach to Jr's user)
	const scored = leaderUsers
		.map((u) => ({ u, score: overlap(u.tokens, clusterTokens(c)) }))
		.filter((s) => s.score >= 3 || (s.score === 2 && subsetEitherWay(s.u.tokens, clusterTokens(c))))
		.sort((a, b) => b.score - a.score || a.u.userId - b.u.userId);
	if (scored.length === 1 || (scored.length > 1 && scored[0].score > scored[1].score)) return scored[0].u;
	return null;
}

// ---------- dossier assembly ----------

// canonicalName preference: mzalendo 13th display name, other mzalendo names,
// then wikipedia (newest first), the roster's mzalendo lookup name (given-first),
// and only then the SURNAME-first roster/non-elected forms.
const SOURCE_PRIORITY = [
	'mzalendo-13th',
	'mzalendo-12th',
	'mzalendo-11th',
	'mzalendo-10th',
	'mzalendo-9th',
	'mzalendo-8th',
	'wikipedia-13th',
	'wikipedia-12th',
	'wikipedia-11th',
	'wikipedia-9th',
	'roster',
	'non-elected',
	'wikipedia-executive',
	'wikipedia-govpast',
	'kiongozi',
	'cog',
	'county-site'
];
const sourceRank = (s: string) => {
	const i = SOURCE_PRIORITY.indexOf(s);
	return i === -1 ? SOURCE_PRIORITY.length : i;
};

type Term = {
	parliament: string;
	seat: string;
	region: string | null;
	party: string | null;
	sources: string[];
	/** Each source's RAW claim for this seat (name form, party, page URL) — the
	 * evidence behind the merged term, kept so conflict checks (stale Wikipedia,
	 * seat disputes) can run off dossiers.json alone. */
	assertions: { source: string; name: string; party: string | null; url: string | null }[];
	url?: string;
	note?: string;
	termStart?: string;
	termEnd?: string;
};

type Dossier = {
	key: string;
	canonicalName: string;
	names: string[];
	platformSlug: string | null;
	userId: number | null;
	/** parliament -> mzalendo person-page slug (raw identity evidence). */
	mzalendoSlugs: Record<string, string>;
	terms: Term[];
	bios: { text: string; source: string; url: string | null; parliament: string | null }[];
	photos: { url: string; source: string }[];
	committees: Record<string, string[]>;
	contacts: Contacts;
	/** Verbatim civic-profile blurbs (kiongozi education/experience) for curation passes. */
	rawProfiles?: { source: string; url: string | null; education: unknown[]; experience: unknown[] }[];
	possibleDuplicateOf?: string;
};

const PARLIAMENT_ORDER = ['13th', '12th', '11th', '10th', '9th', '8th'];
const parliamentRank = (p: string | null) => {
	const i = p ? PARLIAMENT_ORDER.indexOf(p) : -1;
	return i === -1 ? PARLIAMENT_ORDER.length : i;
};

function buildDossier(c: Cluster, dbUser: DbUser | null): Dossier {
	const recs = [...c.records].sort((a, b) => sourceRank(a.source) - sourceRank(b.source));

	const canonicalName = recs[0].name;
	const names: string[] = [];
	for (const r of recs) for (const n of [r.name, ...r.altNames]) if (!names.includes(n)) names.push(n);

	// terms: one per (parliament, seat, region), sources merged into one entry
	const termByKey = new Map<string, Term>();
	const termPartyIsFull = new Map<Term, boolean>();
	for (const r of recs) {
		if (!r.parliament || !r.seat) continue;
		const key = `${r.parliament}|${r.seat}|${r.region ? slugify(r.region) : ''}`;
		let term = termByKey.get(key);
		if (!term) {
			term = { parliament: r.parliament, seat: r.seat, region: r.region, party: null, sources: [], assertions: [] };
			termByKey.set(key, term);
		}
		if (!term.sources.includes(r.source)) term.sources.push(r.source);
		term.assertions.push({ source: r.source, name: r.name, party: r.party, url: r.url });
		// party/url from the highest-priority source that has one; a full party
		// name (mzalendo) beats an abbreviation (wikipedia/roster)
		if (r.party && (!term.party || (r.partyIsFullName && !termPartyIsFull.get(term)))) {
			term.party = r.party;
			termPartyIsFull.set(term, r.partyIsFullName);
		}
		if (r.url && !term.url) term.url = r.url;
		if (r.note && !term.note) term.note = r.note;
		if (r.termStart && !term.termStart) term.termStart = r.termStart;
		if (r.termEnd && !term.termEnd) term.termEnd = r.termEnd;
	}
	// A region-less sighting (e.g. a wikipedia row whose constituency cell was
	// unusable) corroborates an existing regioned term for the same parliament
	// and seat rather than standing as a term of its own.
	for (const [key, term] of [...termByKey.entries()]) {
		if (term.region) continue;
		const host = [...termByKey.values()].find(
			(t) => t !== term && t.parliament === term.parliament && t.seat === term.seat && t.region
		);
		if (!host) continue;
		for (const s of term.sources) if (!host.sources.includes(s)) host.sources.push(s);
		host.assertions.push(...term.assertions);
		if (!host.party && term.party) host.party = term.party;
		if (!host.note && term.note) host.note = term.note;
		termByKey.delete(key);
	}
	const terms = [...termByKey.values()].sort(
		(a, b) =>
			parliamentRank(a.parliament) - parliamentRank(b.parliament) ||
			a.seat.localeCompare(b.seat) ||
			(a.region ?? '').localeCompare(b.region ?? '')
	);

	const bios: Dossier['bios'] = [];
	const seenBios = new Set<string>();
	for (const r of recs) {
		const text = r.bio?.trim();
		if (!text || seenBios.has(text)) continue;
		seenBios.add(text);
		bios.push({ text, source: r.source, url: r.url, parliament: r.parliament });
	}

	const photos: Dossier['photos'] = [];
	const seenPhotos = new Set<string>();
	for (const r of recs) {
		if (!r.photoUrl || seenPhotos.has(r.photoUrl)) continue;
		seenPhotos.add(r.photoUrl);
		photos.push({ url: r.photoUrl, source: r.source });
	}

	// The committee scraper sometimes captures Hansard sentence fragments; a real
	// committee name is short and starts uppercase, anything else is noise.
	const committees: Record<string, string[]> = {};
	for (const r of recs) {
		if (!r.parliament) continue;
		const clean = r.committees.map((c) => c.trim()).filter((c) => c && c.length <= 60 && /^[A-Z]/.test(c));
		if (!clean.length) continue;
		const set = new Set([...(committees[r.parliament] ?? []), ...clean]);
		committees[r.parliament] = [...set].sort();
	}

	const contacts = emptyContacts();
	for (const r of recs) {
		for (const channel of ['emails', 'phones', 'links'] as const) {
			for (const fact of r.contacts[channel]) {
				if (!contacts[channel].some((f) => f.value === fact.value)) contacts[channel].push(fact);
			}
		}
	}

	// mzalendo person-page slugs, per parliament — the raw identity evidence.
	const mzalendoSlugs: Record<string, string> = {};
	for (const r of recs) {
		if (r.mzSlug && r.parliament && !mzalendoSlugs[r.parliament]) mzalendoSlugs[r.parliament] = r.mzSlug;
	}

	const rawProfiles: NonNullable<Dossier['rawProfiles']> = [];
	for (const r of recs) {
		if (r.rawProfile) rawProfiles.push({ source: r.source, url: r.url, ...r.rawProfile });
	}

	return {
		...(rawProfiles.length ? { rawProfiles } : {}),
		key: '', // assigned after slug dedupe below
		canonicalName,
		names,
		platformSlug: dbUser?.slug ?? null,
		userId: dbUser?.userId ?? null,
		mzalendoSlugs,
		terms,
		bios,
		photos,
		committees,
		contacts
	};
}

const dossierByCluster = new Map<Cluster, Dossier>();
for (const c of finalClusters) dossierByCluster.set(c, buildDossier(c, attachDbUser(c)));

// keys: platformSlug when attached, else slugified canonical name; dedupe with -2, -3…
const usedKeys = new Set<string>();
const ordered = [...dossierByCluster.entries()].sort((a, b) =>
	(a[1].platformSlug ?? slugify(a[1].canonicalName)).localeCompare(b[1].platformSlug ?? slugify(b[1].canonicalName)) ||
	a[0].id - b[0].id
);
for (const [, d] of ordered) {
	const base = d.platformSlug ?? slugify(d.canonicalName) ?? 'unknown';
	let key = base;
	let n = 1;
	while (usedKeys.has(key)) key = `${base}-${++n}`;
	usedKeys.add(key);
	d.key = key;
}
for (const [c, d] of ordered) {
	if (c.possibleDuplicateOf) {
		const target = dossierByCluster.get(c.possibleDuplicateOf);
		if (target && target !== d) d.possibleDuplicateOf = target.key;
	}
}

const dossiers = ordered.map(([, d]) => d);
const possibleDuplicates = ordered
	.filter(([c, d]) => d.possibleDuplicateOf)
	.map(([c, d]) => ({ key: d.key, possibleDuplicateOf: d.possibleDuplicateOf!, sharedTokens: c.duplicateSharedTokens }));

writeFileSync(
	join(OUT_DIR, 'dossiers.json'),
	JSON.stringify({ dossiers, possibleDuplicates }, null, '\t') + '\n'
);

// ---------- report ----------

const multiBio = dossiers.filter((d) => d.bios.length > 1).length;
const multiTerm = dossiers.filter((d) => d.terms.length > 1).length;
const multiParliament = dossiers.filter((d) => new Set(d.terms.map((t) => t.parliament)).size > 1).length;
const attached = dossiers.filter((d) => d.userId !== null).length;
console.log(`[dossiers] wrote ${dossiers.length} dossiers to scripts/out/dossiers.json`);
console.log(`[dossiers] >1 bio: ${multiBio} | >1 term: ${multiTerm} | multi-parliament: ${multiParliament}`);
console.log(`[dossiers] attached to DB users: ${attached} | possible duplicates: ${possibleDuplicates.length}`);
