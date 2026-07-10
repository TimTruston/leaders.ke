// One-off enrichment pass: folds ../../candidates_profiles.json (scraped per-candidate
// bio/education/professional/contacts/social, keyed only by a slug link — no name field)
// into src/lib/data/leaders.json and mcas.json in place. Run manually with
// `bun run scripts/lib/merge-candidate-profiles.ts` whenever candidates_profiles.json is
// refreshed; it is NOT part of the `db:seed` pipeline (it edits the JSON sources that
// seed-leaders.ts/seed-mcas.ts read, not the DB).
//
// Matching strategy: a candidate_profiles link looks like
// ".../candidate/<name-tokens>-<region-slug>", e.g.
// "chris-bitta-east-ugenya" for MCA aspirant Chris Bitta, East Ugenya ward. There's no
// structured name field, so:
//   1. Slugify every leaders.json/mcas.json region and index rows by it.
//   2. For each candidate_profiles link, find the longest region-slug suffix match
//      (regions can be multi-word, e.g. "east-ugenya", so try longest-first).
//   3. Among rows sharing that region, score by name-token overlap between the link's
//      remaining prefix and the row's `name`, and only accept the top score if it's > 0 -
//      this both picks the right row when a region has several seats (e.g. Nairobi has an
//      MP, Senator, Woman Rep and Governor) and rejects a region-only coincidence with no
//      real name match.
// Rows whose link has no region suffix match (no location token, e.g. "millicent-omanga"),
// or whose name overlap is 0, are left unmatched and reported - no fuzzy-guessing a person
// from a bare name with hundreds of same-region candidates on file.
//
// candidates_profiles.json carries no `party` field (party affiliation only shows up,
// inconsistently, as free text inside `professional[].institution`, e.g. "Secretary-General
// / Orange Democratic Movement (ODM)") - too unreliable to parse into a structured `party`
// without risking a wrong affiliation, so this pass does NOT touch `party`. It also carries
// no manifesto/pillar content anywhere in the source, so no `pillars` are fabricated here;
// the `pillars` arrays already present in leaders.json (e.g. Edwin Sifuna's) are hand-curated
// and are wired up for seeding separately in people.ts/applyProfile.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { slugify } from './names';

type ExperienceRow = { title: string; institution: string; time: string | null };
type ContactRow = { title: string; value: string };
type SocialRow = { title: string; value: string; href?: string };

type PersonRow = {
	name: string;
	party?: string;
	title: string;
	region: string;
	status: string;
	bio?: string;
	education?: ExperienceRow[];
	professional?: ExperienceRow[];
	contacts?: ContactRow[];
	social?: SocialRow[];
	pillars?: unknown;
};

type CandidateProfile = {
	bio?: string;
	education?: ExperienceRow[];
	professional?: ExperienceRow[];
	contacts?: ContactRow[];
	social?: SocialRow[];
	link: string;
};

const root = fileURLToPath(new URL('../../', import.meta.url));
const leadersPath = `${root}src/lib/data/leaders.json`;
const mcasPath = `${root}src/lib/data/mcas.json`;
const profilesPath = `${root}../candidates_profiles.json`;

const leaders: PersonRow[] = JSON.parse(readFileSync(leadersPath, 'utf-8'));
const mcas: PersonRow[] = JSON.parse(readFileSync(mcasPath, 'utf-8'));
const profiles: CandidateProfile[] = JSON.parse(readFileSync(profilesPath, 'utf-8'));

function tokens(s: string): Set<string> {
	return new Set(slugify(s).split('-').filter(Boolean));
}

/** Loose token equality for the fuzzy fallback only: absorbs a trailing-letter spelling
 * variant like "edwine" vs "edwin" or "matiangi" vs "matiang-i" (the source site drops
 * apostrophes differently than our slugify does) without opening the door to matching
 * unrelated short names. */
function tokensRoughlyEqual(a: string, b: string): boolean {
	if (a === b) return true;
	if (a.length < 4 || b.length < 4) return false;
	return a.startsWith(b) || b.startsWith(a);
}

function overlapCount(a: Set<string>, b: Set<string>): number {
	let n = 0;
	for (const t of a) if ([...b].some((u) => tokensRoughlyEqual(t, u))) n++;
	return n;
}

type RegionEntry = { row: PersonRow };
const regionMap = new Map<string, RegionEntry[]>();
for (const row of [...leaders, ...mcas]) {
	const key = slugify(row.region);
	const list = regionMap.get(key) ?? [];
	list.push({ row });
	regionMap.set(key, list);
}
const regionSlugsByLengthDesc = [...regionMap.keys()].sort((a, b) => b.length - a.length);

// Exact-slug index for the region-suffix-free case (mostly county/national seats, e.g.
// Senator/MP links on the source site: "edwine-watenya-sifuna" with no region suffix at
// all, unlike ward-level MCA links which always end in the ward name). A straight
// slug-equals-name match carries no ambiguity risk, so it's safe even against the much
// larger mcas.json pool.
const byNameSlug = new Map<string, PersonRow>();
const allRows: PersonRow[] = [...leaders, ...mcas];
for (const row of allRows) byNameSlug.set(slugify(row.name), row);

/** Last-resort fuzzy fallback for name variance an exact slug can't absorb (e.g. "Edwine
 * Watenya Sifuna" on the source site vs "Edwin Sifuna" in our data - a middle name plus a
 * spelling variant). Requires overlap on at least first name + one more token, and that the
 * winner beats every other row by a clear margin, so an ambiguous or coincidental partial
 * match is left unmatched rather than misfiled onto the wrong person. */
function findFuzzyNameMatch(slug: string): PersonRow | null {
	const slugTokens = tokens(slug.replace(/-/g, ' '));
	let best: { row: PersonRow; score: number } | null = null;
	let secondBestScore = 0;
	for (const row of allRows) {
		const rowTokens = tokens(row.name);
		const overlap = overlapCount(slugTokens, rowTokens);
		if (overlap < 2) continue;
		if (!best || overlap > best.score) {
			secondBestScore = best?.score ?? 0;
			best = { row, score: overlap };
		} else if (overlap === best.score) {
			secondBestScore = overlap; // tie at the top - ambiguous, reject below
		}
	}
	if (best && best.score > secondBestScore) return best.row;
	return null;
}

function findMatch(slug: string): PersonRow | null {
	const nameOnly = byNameSlug.get(slug);
	if (nameOnly) return nameOnly;

	for (const regionSlug of regionSlugsByLengthDesc) {
		const isWholeSlug = slug === regionSlug;
		const isSuffix = slug.endsWith(`-${regionSlug}`);
		if (!isWholeSlug && !isSuffix) continue;

		const namePart = isWholeSlug ? '' : slug.slice(0, -(regionSlug.length + 1));
		const nameTokens = tokens(namePart.replace(/-/g, ' '));
		const candidates = regionMap.get(regionSlug)!;

		let best: { row: PersonRow; score: number } | null = null;
		for (const { row } of candidates) {
			const overlap = [...tokens(row.name)].filter((t) => nameTokens.has(t)).length;
			if (!best || overlap > best.score) best = { row, score: overlap };
		}
		if (best && best.score > 0) return best.row;
		return null; // longest region suffix matched but no name overlap - don't fall through to a shorter, weaker region match
	}
	return findFuzzyNameMatch(slug);
}

function expKey(e: ExperienceRow): string {
	return `${e.title.trim().toLowerCase()}|${e.institution.trim().toLowerCase()}`;
}

function mergeExperience(existing: ExperienceRow[] | undefined, incoming: ExperienceRow[] | undefined): ExperienceRow[] | undefined {
	if (!incoming?.length) return existing;
	const seen = new Set((existing ?? []).map(expKey));
	const deduped: ExperienceRow[] = [];
	for (const e of incoming) {
		const k = expKey(e);
		if (seen.has(k)) continue;
		seen.add(k); // also dedupes repeats within `incoming` itself
		deduped.push(e);
	}
	if (!deduped.length) return existing;
	return [...(existing ?? []), ...deduped];
}

function mergeContacts(existing: ContactRow[] | undefined, incoming: ContactRow[] | undefined): ContactRow[] | undefined {
	if (!incoming?.length) return existing;
	const seen = new Set((existing ?? []).map((c) => `${c.title.trim().toLowerCase()}|${c.value.trim().toLowerCase()}`));
	const additions = incoming.filter((c) => !seen.has(`${c.title.trim().toLowerCase()}|${c.value.trim().toLowerCase()}`));
	if (!additions.length) return existing;
	return [...(existing ?? []), ...additions];
}

function mergeSocial(existing: SocialRow[] | undefined, incoming: SocialRow[] | undefined): SocialRow[] | undefined {
	if (!incoming?.length) return existing;
	const seen = new Set((existing ?? []).map((s) => (s.href ?? s.value).trim().toLowerCase()));
	const additions = incoming.filter((s) => !seen.has((s.href ?? s.value).trim().toLowerCase()));
	if (!additions.length) return existing;
	return [...(existing ?? []), ...additions];
}

let matched = 0;
let unmatched = 0;
let enriched = 0;
const enrichedNames: string[] = [];

for (const profile of profiles) {
	const slug = profile.link.split('/').filter(Boolean).pop()!;
	const row = findMatch(slug);
	if (!row) {
		unmatched++;
		continue;
	}
	matched++;

	const before = JSON.stringify(row);

	if (!row.bio && profile.bio) row.bio = profile.bio;
	row.education = mergeExperience(row.education, profile.education);
	row.professional = mergeExperience(row.professional, profile.professional);
	row.contacts = mergeContacts(row.contacts, profile.contacts);
	row.social = mergeSocial(row.social, profile.social);

	if (JSON.stringify(row) !== before) {
		enriched++;
		enrichedNames.push(row.name);
	}
}

writeFileSync(leadersPath, JSON.stringify(leaders, null, 2) + '\n');
writeFileSync(mcasPath, JSON.stringify(mcas, null, 2) + '\n');

console.log(`[merge-candidate-profiles] ${profiles.length} source profiles: ${matched} matched, ${unmatched} unmatched, ${enriched} rows actually enriched`);
console.log(enrichedNames.join(', '));
