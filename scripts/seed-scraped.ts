// Seeds freshly scraped 13th-Parliament data into the DB in two explicit stages:
//
//   bun run scripts/seed-scraped.ts            # STAGE 1: analysis only — writes
//                                              #   scripts/out/seed-conflicts.md + .json
//   bun run scripts/seed-scraped.ts --apply    # STAGE 2: analysis, then import ONLY the
//                                              #   clean, unambiguous subset
//
// Sources (scripts/out/):
//   - seed-input-roster.snapshot.json  authoritative current roster from parliament.go.ke
//     (SURNAME-first names) with per-member info.mzalendo.com contact lookups. Snapshotted
//     from scraped-roster.json because a background crawl may still be appending to it.
//   - scraped-wikipedia-13th.json      cross-validation (given-first names, party abbr,
//     the 47 Woman Reps, bios) — preferred bio source.
//   - scraped-mps-13th.json            mzalendo.com NA profiles — party cross-check only
//     (its bios are empty and its name order is inconsistent).
//
// Safety rules: never overwrite existing non-null data, never delete, skip anything
// flagged as a conflict, and mark every scraped contact with contacts.source provenance.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { and, eq, isNull, like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { contacts, leaders, parties, positions, users } from '../src/lib/server/db/schema';
import { user as authUsers } from '../src/lib/server/db/auth.schema';
import { seedPeople, type ContactRow, type PersonRow } from './lib/people';
import { slugify } from './lib/names';

const OUT_DIR = join(import.meta.dir, 'out');
const SNAPSHOT_FILE = join(OUT_DIR, 'seed-input-roster.snapshot.json');
const LIVE_ROSTER_FILE = join(OUT_DIR, 'scraped-roster.json');
const WIKI_FILE = join(OUT_DIR, 'scraped-wikipedia-13th.json');
const MZ13_FILE = join(OUT_DIR, 'scraped-mps-13th.json');
const REPORT_MD = join(OUT_DIR, 'seed-conflicts.md');
const REPORT_JSON = join(OUT_DIR, 'seed-conflicts.json');

// ---------- input shapes ----------

type MzalendoResult = {
	status: 'found' | 'not-found';
	url?: string;
	name?: string; // given-first display name
	email?: string;
	phone?: string;
	fetchedAt?: string;
};
type RosterEntry = {
	name: string; // SURNAME-first, honorifics stripped
	seat: 'MP' | 'Senator';
	region: string; // constituency (MP) or county (Senator); '' on some rows
	county: string;
	party: string; // abbreviation
	elected: boolean; // false = nominated, no geographic seat
	sourceUrl: string;
	mzalendo?: MzalendoResult;
};
type WikiEntry = {
	name: string; // given-first
	seat: 'MP' | 'Woman Rep' | 'Senator';
	region: string;
	party: string; // abbreviation
	articleUrl: string;
	bio: string | null;
	photoUrl: string | null;
};
type Mz13Entry = {
	slug: string;
	url: string;
	name: string;
	constituency: string | null;
	county: string | null; // set for Woman Reps instead of constituency
	party: string | null; // FULL party name
	status: string | null;
	bio: string | null;
	photoUrl: string | null;
};

// ---------- name matching (parliament is SURNAME-first, everything else given-first) ----------

/** Lowercased name tokens worth matching on (drops 1-2 letter initials and punctuation). */
function nameTokens(name: string): string[] {
	return name
		.toLowerCase()
		.replace(/['’]/g, '')
		.replace(/[^a-z\s-]/g, ' ')
		.split(/[\s-]+/)
		.filter((t) => t.length > 2);
}

function tokenOverlap(a: string, b: string): number {
	const bTokens = new Set(nameTokens(b));
	return nameTokens(a).filter((t) => bTokens.has(t)).length;
}

// ---------- party normalization (sources write the same party three different ways) ----------

/** Roster party cell -> a clean abbreviation, or undefined for independents (not a party)
 * and coalition-suffixed cells ("ODM | Azimio La Umoja..." -> "ODM"). */
function cleanRosterParty(raw: string): string | undefined {
	const p = raw.split('|')[0].trim();
	if (!p || /^ind\.?$/i.test(p) || /^independent$/i.test(p)) return undefined;
	return p;
}

/** Comparison key: case/punctuation/dash-variant insensitive ("FORD - K" == "FORD–K"). */
function partyKey(s: string): string {
	return s.split('|')[0].toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Equivalences the DB can't derive (well-known short forms wikipedia uses).
const PARTY_ALIASES: Record<string, string[]> = {
	wdm: ['wiper', 'wiperdemocraticmovement'],
	fordk: ['fordkenya'],
	jp: ['jubilee', 'jubileeparty']
};

/** Fixes stray internal caps some mzalendo display names carry ("Gideon KiMAIYO" ->
 * "Gideon Kimaiyo") — only rewrites tokens with a lowercase-then-uppercase transition,
 * so particles like "wa" and apostrophe names like "Thang'wa" pass through untouched. */
function fixInternalCaps(name: string): string {
	return name
		.split(/\s+/)
		.map((w) => (/[a-z][A-Z]/.test(w) ? w.toLowerCase().replace(/(^|['-])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase()) : w))
		.join(' ');
}

/** Edit distance between two slugs — only used to SUGGEST the closest positions.region
 * for an unmatched roster region; auto-accept stays slug-exact-match only. */
function levenshtein(a: string, b: string): number {
	const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
	for (let j = 0; j <= b.length; j++) dp[0][j] = j;
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
		}
	}
	return dp[a.length][b.length];
}

// ---------- findings (the conflict report) ----------

type FindingClass =
	| 'nominated' // no geographic seat — unseedable as-is
	| 'vacant-seat' // roster row literally named "Vacant"
	| 'missing-region' // elected member but the constituency cell was empty
	| 'duplicate-roster-row' // same seat listed twice with the same person
	| 'region-unmatched' // no positions.region slug-matches the roster region
	| 'ambiguous-seat' // can't tell MP vs Woman Rep (county-named constituency), or two people on one seat
	| 'seat-conflict' // DB already has a current holder sharing ZERO name tokens
	| 'source-name-conflict' // roster vs wikipedia/mzalendo names share ZERO tokens for the same seat
	| 'party-mismatch' // sources disagree on party (informational — roster party wins)
	| 'party-not-in-db' // roster party abbreviation missing from the parties table
	| 'contact-conflict' // email/phone already live on ANOTHER user's contacts row
	| 'contact-channel-occupied' // holder already has a live row for that channel (kept as-is)
	| 'mzalendo-name-mismatch' // mzalendo lookup landed on a different person — contacts dropped
	| 'name-collision' // an existing account already owns this name's seed email/slug — reattach would conflate two people
	| 'name-order-unverified'; // seeded with parliament's SURNAME-first order (no given-first source)

type Finding = {
	category: FindingClass;
	name: string;
	seat: string;
	region: string;
	detail: string;
};

// ---------- the import plan (what --apply executes) ----------

type PlannedContact = ContactRow & { channel: 'email' | 'sms' };
type CreatePlan = {
	row: PersonRow; // fed straight to seedPeople
	sourceUrl: string;
};
type EnrichPlan = {
	leaderId: number;
	userId: number;
	holderName: string;
	title: string;
	region: string;
	contacts: PlannedContact[];
	bio: string | null; // only set when users.bio is currently null
};

type Analysis = {
	findings: Finding[];
	creates: CreatePlan[];
	enriches: EnrichPlan[];
	photosSkipped: { wikipedia: number; mzalendo: number };
	rosterTotal: number;
};

// ---------- analysis ----------

async function analyze(db: ReturnType<typeof drizzle>): Promise<Analysis> {
	// Work from the snapshot — the emails crawl may still be appending to scraped-roster.json.
	if (!existsSync(SNAPSHOT_FILE)) copyFileSync(LIVE_ROSTER_FILE, SNAPSHOT_FILE);
	const roster: RosterEntry[] = JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf8'));
	const wiki: WikiEntry[] = JSON.parse(readFileSync(WIKI_FILE, 'utf8'));
	// mzalendo.com's listing includes pager/junk rows with an empty name — drop them.
	const mz13: Mz13Entry[] = (JSON.parse(readFileSync(MZ13_FILE, 'utf8')) as Mz13Entry[]).filter((e) => e.name?.trim());

	// DB lookups, preloaded once: positions by (title, slug(region)), current holders,
	// live contact values, live per-user channels, party abbreviations/names.
	const positionRows = await db
		.select({ id: positions.id, title: positions.title, region: positions.region })
		.from(positions)
		.where(isNull(positions.deletedAt));
	const positionBySlug = new Map<string, { id: number; region: string }>();
	for (const p of positionRows) positionBySlug.set(`${p.title}:${slugify(p.region)}`, { id: p.id, region: p.region });

	const holderRows = await db
		.select({
			positionId: leaders.positionId,
			leaderId: leaders.id,
			userId: users.id,
			firstName: users.firstName,
			otherNames: users.otherNames,
			bio: users.bio
		})
		.from(leaders)
		.innerJoin(users, eq(leaders.userId, users.id))
		.where(and(eq(leaders.status, 'current'), isNull(leaders.deletedAt)));
	const holderByPosition = new Map(holderRows.map((h) => [h.positionId, h]));

	const contactRows = await db
		.select({ userId: contacts.userId, channel: contacts.channel, value: contacts.value })
		.from(contacts)
		.innerJoin(users, eq(contacts.userId, users.id))
		.where(isNull(contacts.deletedAt));
	const contactOwnerByValue = new Map(contactRows.map((c) => [`${c.channel}:${c.value}`, c.userId]));
	const channelsByUser = new Map<number, Set<string>>();
	for (const c of contactRows) {
		if (!channelsByUser.has(c.userId)) channelsByUser.set(c.userId, new Set());
		channelsByUser.get(c.userId)!.add(c.channel);
	}
	const userNameById = new Map(holderRows.map((h) => [h.userId, `${h.firstName} ${h.otherNames}`]));

	// Accounts already holding a seed email: seedPeople derives its idempotency email from
	// slugify(name), so a planned create colliding with one of these would REATTACH the seat
	// to that other person's account (two different people share a name slug) — flag instead.
	const seedEmailRows = await db
		.select({ email: authUsers.email, userId: users.id })
		.from(authUsers)
		.innerJoin(users, eq(users.authUserId, authUsers.id))
		.where(like(authUsers.email, '%@seed.leaders.ke'));
	const userIdBySeedEmail = new Map(seedEmailRows.map((r) => [r.email, r.userId]));

	const partyRows = await db.select({ name: parties.name, abbreviation: parties.abbreviation }).from(parties);
	// seedPeople resolves a membership by EXACT name/abbreviation, so flag on that.
	const knownPartyExact = new Set(partyRows.flatMap((p) => [p.name, p.abbreviation]).filter(Boolean) as string[]);
	const partyNameKeyByAbbrKey = new Map(partyRows.filter((p) => p.abbreviation).map((p) => [partyKey(p.abbreviation!), partyKey(p.name)]));

	/** Whether a roster abbreviation and a wikipedia party string plausibly name the same party. */
	const sameParty = (rosterAbbr: string, wikiParty: string): boolean => {
		const a = partyKey(rosterAbbr);
		const b = partyKey(wikiParty);
		if (!a || !b || a === b) return true;
		const dbFull = partyNameKeyByAbbrKey.get(a); // e.g. jp -> jubileeparty
		if (dbFull && (b === dbFull || b.includes(dbFull) || dbFull.includes(b))) return true;
		return (PARTY_ALIASES[a] ?? []).some((alias) => b === alias || b.includes(alias));
	};

	// Source indexes by (seat, slug(region)).
	const wikiBySeat = new Map<string, WikiEntry>();
	for (const w of wiki) wikiBySeat.set(`${w.seat}:${slugify(w.region)}`, w);
	const mz13BySeat = new Map<string, Mz13Entry>();
	for (const m of mz13) {
		if (m.constituency) mz13BySeat.set(`MP:${slugify(m.constituency)}`, m);
		else if (m.county && m.status?.startsWith('Women')) mz13BySeat.set(`Woman Rep:${slugify(m.county)}`, m);
	}

	const findings: Finding[] = [];
	const flag = (category: FindingClass, e: { name: string; seat: string; region: string }, detail: string) =>
		findings.push({ category, name: e.name, seat: e.seat, region: e.region, detail });

	// --- pass 1: classify every roster row to a position title + canonical region ---
	type Classified = { entry: RosterEntry; title: 'MP' | 'Woman Rep' | 'Senator'; position: { id: number; region: string } };
	const classified: Classified[] = [];

	for (const entry of roster) {
		if (/^vacant$/i.test(entry.name.trim())) {
			flag('vacant-seat', entry, 'roster row is a placeholder for a vacant seat');
			continue;
		}
		if (!entry.elected) {
			flag('nominated', entry, `nominated ${entry.seat} (${entry.party || 'no party'}) — no geographic seat to attach to`);
			continue;
		}
		if (!entry.region.trim()) {
			flag('missing-region', entry, 'elected member but parliament.go.ke listed no constituency (e.g. Speaker/leadership rows)');
			continue;
		}

		const regionSlug = slugify(entry.region);
		if (entry.seat === 'Senator') {
			const pos = positionBySlug.get(`Senator:${regionSlug}`);
			if (!pos) {
				flag('region-unmatched', entry, `no Senator position for "${entry.region}"${closest('Senator')}`);
				continue;
			}
			classified.push({ entry, title: 'Senator', position: pos });
			continue;
		}

		// MP rows hide the 47 Woman Reps (their constituency cell = the county). A region
		// can be a real constituency, a county, or BOTH (Vihiga/Makueni/Kiambu) — wikipedia's
		// per-seat name is the tiebreaker for the both case.
		const mpPos = positionBySlug.get(`MP:${regionSlug}`);
		const wrPos = regionSlug === slugify(entry.county) ? positionBySlug.get(`Woman Rep:${regionSlug}`) : undefined;
		if (mpPos && wrPos) {
			const mpWiki = wikiBySeat.get(`MP:${regionSlug}`);
			const wrWiki = wikiBySeat.get(`Woman Rep:${regionSlug}`);
			const isMp = mpWiki ? tokenOverlap(entry.name, mpWiki.name) > 0 : false;
			const isWr = wrWiki ? tokenOverlap(entry.name, wrWiki.name) > 0 : false;
			if (isMp === isWr) {
				flag('ambiguous-seat', entry, `"${entry.region}" is both a constituency and a county and wikipedia can't disambiguate`);
				continue;
			}
			classified.push({ entry, title: isWr ? 'Woman Rep' : 'MP', position: isWr ? wrPos! : mpPos });
		} else if (wrPos) {
			classified.push({ entry, title: 'Woman Rep', position: wrPos });
		} else if (mpPos) {
			classified.push({ entry, title: 'MP', position: mpPos });
		} else {
			flag('region-unmatched', entry, `no MP/Woman Rep position slug-matches "${entry.region}"${closest('MP')}`);
		}

		function closest(title: string): string {
			let best: { region: string; d: number } | null = null;
			for (const p of positionRows) {
				if (p.title !== title && p.title !== 'Woman Rep') continue;
				const d = levenshtein(regionSlug, slugify(p.region));
				if (!best || d < best.d) best = { region: `${p.title} ${p.region}`, d };
			}
			return best ? ` — closest positions row: "${best.region}" (edit distance ${best.d})` : '';
		}
	}

	// --- pass 2: collapse duplicate rows on the same seat ---
	const bySeatKey = new Map<string, Classified[]>();
	for (const c of classified) {
		const key = `${c.title}:${c.position.id}`;
		if (!bySeatKey.has(key)) bySeatKey.set(key, []);
		bySeatKey.get(key)!.push(c);
	}
	const deduped: Classified[] = [];
	for (const group of bySeatKey.values()) {
		if (group.length === 1) {
			deduped.push(group[0]);
			continue;
		}
		const [a, ...rest] = group;
		if (rest.every((r) => tokenOverlap(a.entry.name, r.entry.name) > 0)) {
			// Same person scraped twice (e.g. Saku's Raso/Rasso) — keep the row with mzalendo data.
			const keep = group.find((g) => g.entry.mzalendo?.status === 'found') ?? a;
			deduped.push(keep);
			for (const g of group) {
				if (g !== keep) flag('duplicate-roster-row', g.entry, `same person as "${keep.entry.name}" on ${keep.title} ${keep.position.region} — kept the other row`);
			}
		} else {
			for (const g of group) flag('ambiguous-seat', g.entry, `two different people claim ${g.title} ${g.position.region} — all skipped`);
		}
	}

	// --- pass 3: cross-source checks + build the plan ---
	const creates: CreatePlan[] = [];
	const enriches: EnrichPlan[] = [];
	const plannedValues = new Set<string>(); // channel:value claimed earlier in this same plan
	const plannedNameSlugs = new Set<string>(); // guards the unique seed-email seedPeople derives

	for (const { entry, title, position } of deduped) {
		const regionSlug = slugify(position.region);
		const wikiRow = wikiBySeat.get(`${title}:${regionSlug}`);
		const mz13Row = mz13BySeat.get(`${title}:${regionSlug}`);
		const mz = entry.mzalendo?.status === 'found' ? entry.mzalendo : undefined;

		// Same-person-across-sources sanity: a per-seat source naming a DIFFERENT person
		// means at least one source is stale/wrong — report and leave the seat alone.
		if (wikiRow && tokenOverlap(entry.name, wikiRow.name) === 0) {
			flag('source-name-conflict', entry, `wikipedia says ${title} ${position.region} is "${wikiRow.name}" — skipped`);
			continue;
		}
		if (mz13Row && tokenOverlap(entry.name, mz13Row.name) === 0) {
			flag('source-name-conflict', entry, `mzalendo.com says ${title} ${position.region} is "${mz13Row.name}" — skipped`);
			continue;
		}

		// Party disagreement is reported but non-blocking: parliament.go.ke is the
		// authoritative current roster, so its party wins. Independents carry no party.
		const rosterParty = cleanRosterParty(entry.party);
		if (rosterParty && wikiRow?.party && !sameParty(rosterParty, wikiRow.party)) {
			flag('party-mismatch', entry, `roster says ${rosterParty}, wikipedia says ${wikiRow.party} — seeding roster's`);
		}
		if (rosterParty && !knownPartyExact.has(rosterParty)) {
			flag('party-not-in-db', entry, `party "${rosterParty}" not in the parties table — membership will be skipped`);
		}

		// Contacts: only from the member's own mzalendo lookup, always with provenance.
		// A lookup that landed on a different person contributes nothing.
		let plannedContacts: PlannedContact[] = [];
		if (mz?.url && (mz.email || mz.phone)) {
			if (mz.name && tokenOverlap(entry.name, mz.name) === 0) {
				flag('mzalendo-name-mismatch', entry, `mzalendo lookup returned "${mz.name}" (${mz.url}) — contacts dropped`);
			} else {
				const source = { url: mz.url, publisher: 'info.mzalendo.com', fetchedAt: mz.fetchedAt ?? new Date().toISOString() };
				if (mz.email) plannedContacts.push({ title: 'Email', value: mz.email, channel: 'email', source });
				if (mz.phone) plannedContacts.push({ title: 'Phone', value: mz.phone, channel: 'sms', source });
			}
		}

		const holder = holderByPosition.get(position.id);

		// Drop any contact whose value is already live on ANOTHER user's row, or already
		// claimed by an earlier row in this same plan (the DB enforces one live owner
		// per channel+value).
		plannedContacts = plannedContacts.filter((c) => {
			const key = `${c.channel}:${c.value}`;
			const owner = contactOwnerByValue.get(key);
			if (owner !== undefined && owner !== holder?.userId) {
				flag('contact-conflict', entry, `${c.channel} "${c.value}" already belongs to user #${owner} (${userNameById.get(owner) ?? 'unknown'}) — skipped`);
				return false;
			}
			if (owner === undefined && plannedValues.has(key)) {
				flag('contact-conflict', entry, `${c.channel} "${c.value}" is also claimed by another roster row in this run — skipped`);
				return false;
			}
			return true;
		});

		const wikiBio = wikiRow?.bio?.replace(/\s+/g, ' ').trim() || null;

		if (holder) {
			// Seat already has a current leader: never replace, only enrich. Zero shared
			// name tokens (across roster + mzalendo forms) means it's a different person.
			const dbName = `${holder.firstName} ${holder.otherNames}`;
			if (tokenOverlap(`${entry.name} ${mz?.name ?? ''}`, dbName) === 0) {
				flag('seat-conflict', entry, `DB already has "${dbName}" as current ${title} for ${position.region} — skipped`);
				continue;
			}
			// Never stack a second live contact row on a channel the holder already filled.
			plannedContacts = plannedContacts.filter((c) => {
				if (contactOwnerByValue.get(`${c.channel}:${c.value}`) === holder.userId) return false; // identical row already there
				if (channelsByUser.get(holder.userId)?.has(c.channel)) {
					flag('contact-channel-occupied', entry, `${dbName} already has a live ${c.channel} contact — scraped value "${c.value}" not added`);
					return false;
				}
				return true;
			});
			const bio = holder.bio ? null : wikiBio; // only backfill a NULL bio
			if (plannedContacts.length || bio) {
				enriches.push({ leaderId: holder.leaderId, userId: holder.userId, holderName: dbName, title, region: position.region, contacts: plannedContacts, bio });
				for (const c of plannedContacts) plannedValues.add(`${c.channel}:${c.value}`);
			}
			continue;
		}

		// Fresh seat: pick a given-first display name — mzalendo's, else wikipedia's,
		// else fall back to parliament's SURNAME-first form (reported for manual review).
		let displayName = entry.name;
		if (mz?.name && tokenOverlap(entry.name, mz.name) > 0) displayName = mz.name;
		else if (wikiRow) displayName = wikiRow.name;
		else flag('name-order-unverified', entry, 'no given-first source matched — seeded with parliament\'s SURNAME-first order');
		displayName = fixInternalCaps(displayName);

		const nameSlug = slugify(displayName);
		if (plannedNameSlugs.has(nameSlug)) {
			flag('ambiguous-seat', entry, `another planned row also slugifies to "${nameSlug}" (seed emails would collide) — skipped for manual review`);
			continue;
		}
		const collidingUserId = userIdBySeedEmail.get(`${nameSlug}@seed.leaders.ke`);
		if (collidingUserId !== undefined) {
			flag('name-collision', entry, `user #${collidingUserId} already owns ${nameSlug}@seed.leaders.ke — seeding would attach this seat to their account; skipped`);
			continue;
		}
		plannedNameSlugs.add(nameSlug);
		for (const c of plannedContacts) plannedValues.add(`${c.channel}:${c.value}`);

		creates.push({
			sourceUrl: entry.sourceUrl,
			row: {
				name: displayName,
				party: rosterParty,
				title,
				region: position.region, // canonical positions.region spelling
				status: 'current',
				contacts: plannedContacts,
				...(wikiBio ? { bio: wikiBio } : {})
			}
		});
	}

	return {
		findings,
		creates,
		enriches,
		photosSkipped: {
			wikipedia: wiki.filter((w) => w.photoUrl).length,
			mzalendo: mz13.filter((m) => m.photoUrl).length
		},
		rosterTotal: roster.length
	};
}

// ---------- report ----------

// How to navigate each conflict class, rendered under its section in the .md report.
const SUGGESTIONS: Record<FindingClass, string> = {
	nominated: 'Needs a non-geographic position model (e.g. a "Nominated MP/Senator" position with a national region) — a product decision, not a data fix.',
	'vacant-seat': 'Drop placeholder rows at scrape time (filter name == "Vacant" in scrape-contacts.ts).',
	'missing-region': "Parliament's listing omits the constituency for Speakers/leadership rows — scrape the member's own page for the seat, or hand-fill these few rows in the roster JSON.",
	'duplicate-roster-row': 'Dedupe the roster scraper on the member-page URL; the duplicate carried a spelling variant of the same name.',
	'region-unmatched': 'Add a small alias map (parliament spelling to positions.region) in the scraper/importer; only slug-exact matches are auto-accepted.',
	'ambiguous-seat': 'Manual review list — resolve who actually holds the seat, then re-run.',
	'seat-conflict': 'Manual review: the existing DB holder (from leaders.json) shares zero name tokens with the authoritative roster — likely stale seed data to retire by hand.',
	'source-name-conflict': 'Manual review: at least one of parliament/wikipedia/mzalendo is stale for this seat (by-elections, court rulings).',
	'party-mismatch': 'Informational — parliament.go.ke party was seeded; review for post-election defections if party accuracy matters.',
	'party-not-in-db': 'Add the missing party (or an abbreviation alias) to the parties seed, then re-run to backfill memberships.',
	'contact-conflict': 'Manual review: one email/phone can only have one live owner; decide who genuinely holds it.',
	'contact-channel-occupied': 'Informational — the existing (possibly hand-entered/verified) contact was kept; scraped value is in this report if ever needed.',
	'mzalendo-name-mismatch': "The mzalendo site-search matched the wrong person; tighten the search (require the constituency on the person page) and re-crawl with --redo-not-found.",
	'name-collision': 'Manual review: a different person with the same name slug already has an account, and seedPeople keys idempotency on slugify(name)@seed.leaders.ke — seed these by hand with a disambiguated name (e.g. include the middle name).',
	'name-order-unverified': "Seeded from parliament's SURNAME-first form; fix firstName/otherNames by hand or extend the scraper to read the member's own page."
};

const CLASS_ORDER: FindingClass[] = [
	'nominated', 'missing-region', 'vacant-seat', 'duplicate-roster-row', 'region-unmatched',
	'ambiguous-seat', 'seat-conflict', 'source-name-conflict', 'mzalendo-name-mismatch',
	'name-collision', 'contact-conflict', 'contact-channel-occupied', 'party-mismatch',
	'party-not-in-db', 'name-order-unverified'
];

function writeReports(a: Analysis) {
	mkdirSync(OUT_DIR, { recursive: true });
	const byClass = new Map<FindingClass, Finding[]>();
	for (const f of a.findings) {
		if (!byClass.has(f.category)) byClass.set(f.category, []);
		byClass.get(f.category)!.push(f);
	}

	const createSplit = { MP: 0, 'Woman Rep': 0, Senator: 0 } as Record<string, number>;
	for (const c of a.creates) createSplit[c.row.title] = (createSplit[c.row.title] ?? 0) + 1;
	const planned = {
		creates: a.creates.length,
		createSplit,
		enriches: a.enriches.length,
		emailsPlanned:
			a.creates.flatMap((c) => c.row.contacts ?? []).filter((c) => c.title === 'Email').length +
			a.enriches.flatMap((e) => e.contacts).filter((c) => c.channel === 'email').length,
		phonesPlanned:
			a.creates.flatMap((c) => c.row.contacts ?? []).filter((c) => c.title === 'Phone').length +
			a.enriches.flatMap((e) => e.contacts).filter((c) => c.channel === 'sms').length,
		biosPlanned: a.creates.filter((c) => c.row.bio).length + a.enriches.filter((e) => e.bio).length
	};

	writeFileSync(
		REPORT_JSON,
		JSON.stringify(
			{
				generatedAt: new Date().toISOString(),
				rosterTotal: a.rosterTotal,
				planned,
				photosAvailableButSkipped: a.photosSkipped,
				conflictCounts: Object.fromEntries(CLASS_ORDER.filter((c) => byClass.has(c)).map((c) => [c, byClass.get(c)!.length])),
				suggestions: Object.fromEntries(CLASS_ORDER.filter((c) => byClass.has(c)).map((c) => [c, SUGGESTIONS[c]])),
				findings: a.findings,
				plan: {
					creates: a.creates.map((c) => ({ ...c.row, contacts: c.row.contacts?.map(({ title, value }) => ({ title, value })) })),
					enriches: a.enriches.map((e) => ({
						holder: e.holderName, title: e.title, region: e.region,
						contacts: e.contacts.map(({ channel, value }) => ({ channel, value })),
						bio: e.bio ? `${e.bio.slice(0, 80)}…` : null
					}))
				}
			},
			null,
			'\t'
		)
	);

	const lines: string[] = [];
	lines.push('# Scraped 13th-Parliament seed: conflicts and duplicates');
	lines.push('');
	lines.push(`Generated ${new Date().toISOString()} from \`seed-input-roster.snapshot.json\` (${a.rosterTotal} roster rows), \`scraped-wikipedia-13th.json\`, \`scraped-mps-13th.json\`.`);
	lines.push('');
	lines.push('## Summary');
	lines.push('');
	lines.push(`| Metric | Count |`);
	lines.push(`| --- | ---: |`);
	lines.push(`| Roster rows | ${a.rosterTotal} |`);
	lines.push(`| Clean new leaders to create | ${planned.creates} (MP ${createSplit.MP}, Woman Rep ${createSplit['Woman Rep']}, Senator ${createSplit.Senator}) |`);
	lines.push(`| Existing profiles to enrich | ${planned.enriches} |`);
	lines.push(`| Emails to add | ${planned.emailsPlanned} |`);
	lines.push(`| Phones to add | ${planned.phonesPlanned} |`);
	lines.push(`| Bios to backfill (wikipedia) | ${planned.biosPlanned} |`);
	lines.push(`| Photos available but skipped (policy: no external hotlinks) | wikipedia ${a.photosSkipped.wikipedia}, mzalendo ${a.photosSkipped.mzalendo} |`);
	for (const c of CLASS_ORDER) if (byClass.has(c)) lines.push(`| ${c} | ${byClass.get(c)!.length} |`);
	lines.push('');
	for (const c of CLASS_ORDER) {
		const rows = byClass.get(c);
		if (!rows) continue;
		lines.push(`## ${c} (${rows.length})`);
		lines.push('');
		lines.push(`**Suggested navigation:** ${SUGGESTIONS[c]}`);
		lines.push('');
		lines.push('| Name | Seat | Region | Detail |');
		lines.push('| --- | --- | --- | --- |');
		for (const f of rows) lines.push(`| ${f.name} | ${f.seat} | ${f.region || '—'} | ${f.detail.replace(/\|/g, '\\|')} |`);
		lines.push('');
	}
	writeFileSync(REPORT_MD, lines.join('\n'));
	console.log(`[report] wrote ${REPORT_MD} and ${REPORT_JSON}`);
	console.log(`[report] plan: ${planned.creates} creates, ${planned.enriches} enriches, ${a.findings.length} findings across ${byClass.size} classes`);
}

// ---------- apply (STAGE 2) ----------

async function apply(db: ReturnType<typeof drizzle>, a: Analysis) {
	// Creates run through the shared seed pipeline (auth user + domain user + slug +
	// leaders row + party membership + contacts-with-source + bio via applyProfile).
	await seedPeople(db, a.creates.map((c) => c.row), 'scraped-13th');

	// Enrichment: contacts and bio backfill only — the plan already excluded occupied
	// channels, conflicting values, and non-null bios.
	let contactsAdded = 0;
	let biosBackfilled = 0;
	for (const e of a.enriches) {
		for (const c of e.contacts) {
			await db
				.insert(contacts)
				.values({ userId: e.userId, channel: c.channel, value: c.value, source: c.source })
				.onConflictDoNothing(); // belt-and-braces on the live (channel, value) unique index
			contactsAdded++;
		}
		if (e.bio) {
			// Guard again at write time: only ever fill a NULL bio.
			await db.update(users).set({ bio: e.bio }).where(and(eq(users.id, e.userId), isNull(users.bio)));
			biosBackfilled++;
		}
	}
	console.log(`[apply] enriched ${a.enriches.length} existing profiles: ${contactsAdded} contacts inserted, ${biosBackfilled} bios backfilled`);
}

// ---------- entry ----------

const { values: flags } = parseArgs({ options: { apply: { type: 'boolean', default: false } } });

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const client = postgres(process.env.DATABASE_URL, { max: 1 });
const db = drizzle(client);

const analysis = await analyze(db);
writeReports(analysis);
if (flags.apply) await apply(db, analysis);
else console.log('[dry-run] no DB writes performed — re-run with --apply to import the clean subset');
await client.end();
