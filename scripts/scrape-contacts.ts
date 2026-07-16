// Harvests current MPs' and Senators' public contact details into `contacts` rows
// with provenance (contacts.source), powering the leader-accepted-claims email path.
//
// Sources:
//   - parliament.go.ke member tables: the authoritative CURRENT roster (name, seat,
//     county, party, elected/nominated) — but its member pages list no personal emails.
//   - info.mzalendo.com person pages (CC BY-SA 4.0): each MP/Senator's published
//     Email + Telephone, found via Mzalendo's site search.
//
// Three resumable phases, each writing/reading scripts/out/scraped-roster.json so the
// file can be eyeballed (and hand-corrected) between phases:
//   bun run scripts/scrape-contacts.ts --roster   # parliament.go.ke -> roster entries
//   bun run scripts/scrape-contacts.ts --emails   # + Mzalendo email/phone per entry
//   bun run scripts/scrape-contacts.ts --import   # upsert into the DB
// No flags runs roster + emails (never import — that stays an explicit step).
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { contacts, leaders, positions, users } from '../src/lib/server/db/schema';
import { seedPeople, type ContactSource, type PersonRow } from './lib/people';
import { slugify } from './lib/names';

const OUT_DIR = join(import.meta.dir, 'out');
const ROSTER_FILE = join(OUT_DIR, 'scraped-roster.json');

type MzalendoResult = {
	status: 'found' | 'not-found';
	url?: string;
	/** Mzalendo's display name (given-name-first — nicer than parliament's SURNAME-first caps). */
	name?: string;
	email?: string;
	phone?: string;
	/** Social/profile links published in the same contact box (Facebook, Twitter...). */
	links?: string[];
	fetchedAt?: string;
};

type RosterEntry = {
	name: string; // cleaned from the parliament listing (surname-first order, honorifics stripped)
	seat: 'MP' | 'Senator';
	region: string; // constituency (MP) or county (Senator) — matches positions.region
	county: string;
	party: string;
	elected: boolean; // false = nominated (no geographic seat to match)
	sourceUrl: string; // the parliament.go.ke member page this row came from
	mzalendo?: MzalendoResult;
};

// ---------- fetching ----------

const DELAY_MS = 1200; // both sites are small public services — crawl gently

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** GET with retries — info.mzalendo.com in particular 502s intermittently. */
async function fetchText(url: string, tries = 4): Promise<string> {
	for (let attempt = 1; ; attempt++) {
		try {
			const res = await fetch(url, { headers: { 'User-Agent': 'leaders.ke contact importer (techytimo@gmail.com)' } });
			if (res.ok) return await res.text();
			if (attempt >= tries) throw new Error(`HTTP ${res.status}`);
		} catch (error) {
			if (attempt >= tries) throw error instanceof Error ? error : new Error(String(error));
		}
		await sleep(2000 * attempt);
	}
}

// ---------- name cleanup ----------

const HONORIFICS = new Set([
	'hon', 'sen', 'dr', 'prof', 'eng', 'amb', 'maj', 'gen', 'capt', 'col', 'rtd', 'justice', 'bishop', 'cpa', 'fr', 'mr', 'mrs', 'ms'
]);
const POST_NOMINALS = new Set(['cbs', 'egh', 'mgh', 'mbs', 'hsc', 'ogw', 'mp', 'cs', 'ebs', 'ndc', 'psc', 'phd', 'obe', 'sc']);

/** "HON (DR.) KING'OLA PATRICK MAKAU, CBS" -> "King'ola Patrick Makau" */
function cleanName(raw: string): string {
	const stripped = raw
		.replace(/\([^)]*\)/g, ' ') // (Dr.), (Rtd)...
		.split(',') // drop post-nominal segments ("..., CBS, MP")
		.filter((seg) => {
			const tokens = seg.trim().toLowerCase().split(/[.\s]+/).filter(Boolean);
			return tokens.length > 0 && !tokens.every((t) => POST_NOMINALS.has(t));
		})
		.join(' ');
	const words = stripped
		.split(/\s+/)
		.map((w) => w.replace(/\./g, ''))
		.filter((w) => w && !HONORIFICS.has(w.toLowerCase()) && !POST_NOMINALS.has(w.toLowerCase()));
	return words.map(titleCaseWord).join(' ');
}

/** "KING'OLA" -> "King'ola", "MACHAKOS" -> "Machakos" (word-by-word, apostrophe-aware). */
function titleCaseWord(word: string): string {
	return word
		.toLowerCase()
		.replace(/(^|['-])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

function titleCasePlace(place: string): string {
	return place.trim().split(/\s+/).map(titleCaseWord).join(' ');
}

/** Lowercased name tokens worth matching on (drops 1-2 letter initials). */
function nameTokens(name: string): string[] {
	return name.toLowerCase().replace(/[^a-z\s'-]/g, ' ').split(/\s+/).filter((t) => t.length > 2);
}

function tokenOverlap(a: string, b: string): number {
	const bTokens = new Set(nameTokens(b));
	return nameTokens(a).filter((t) => bTokens.has(t)).length;
}

// ---------- phase: roster (parliament.go.ke) ----------

const PARLIAMENT = 'https://www.parliament.go.ke';

/** One table cell's plain text by its `headers` attribute. */
function cellText(rowHtml: string, headersAttr: string): string {
	const m = rowHtml.match(new RegExp(`<td[^>]*headers="${headersAttr}"[^>]*>([\\s\\S]*?)</td>`));
	return m ? m[1].replace(/<[^>]+>/g, ' ').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim() : '';
}

async function scrapeMps(): Promise<RosterEntry[]> {
	const entries: RosterEntry[] = [];
	for (let page = 0; ; page++) {
		const url = `${PARLIAMENT}/the-national-assembly/mps?page=${page}`;
		const html = await fetchText(url);
		const rows = html.match(/<tr class="mp">[\s\S]*?<\/tr>/g) ?? [];
		let found = 0;
		for (const row of rows) {
			const rawName = cellText(row, 'view-field-name-table-column');
			if (!rawName) continue; // placeholder rows with an image but no data
			const memberPath = row.match(/href="(\/the-national-assembly\/[^"]+)"/)?.[1] ?? '/the-national-assembly/mps';
			const status = cellText(row, 'view-field-status-table-column');
			entries.push({
				name: cleanName(rawName),
				seat: 'MP',
				region: titleCasePlace(cellText(row, 'view-field-constituency-table-column')),
				county: titleCasePlace(cellText(row, 'view-field-county-table-column')),
				party: cellText(row, 'view-field-party-table-column'),
				elected: !/nominat/i.test(status),
				sourceUrl: `${PARLIAMENT}${memberPath}`
			});
			found++;
		}
		console.log(`[roster] MPs page ${page}: ${found} members (total ${entries.length})`);
		if (found === 0) break;
		await sleep(DELAY_MS);
	}
	return entries;
}

async function scrapeSenators(): Promise<RosterEntry[]> {
	const entries: RosterEntry[] = [];
	for (let page = 0; ; page++) {
		const url = `${PARLIAMENT}/the-senate/senators?page=${page}`;
		const html = await fetchText(url);
		const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];
		let found = 0;
		for (const row of rows) {
			const rawName = cellText(row, 'view-field-senator-table-column');
			if (!rawName) continue;
			const county = titleCasePlace(cellText(row, 'view-field-county-senator-table-column'));
			const status = cellText(row, 'view-field-status-senator-table-column');
			entries.push({
				name: cleanName(rawName),
				seat: 'Senator',
				region: county,
				county,
				party: cellText(row, 'view-field-party-senator-table-column'),
				elected: !/nominat/i.test(status),
				sourceUrl: url
			});
			found++;
		}
		console.log(`[roster] Senators page ${page}: ${found} members (total ${entries.length})`);
		if (found === 0) break;
		await sleep(DELAY_MS);
	}
	return entries;
}

async function phaseRoster() {
	const entries = [...(await scrapeMps()), ...(await scrapeSenators())];
	mkdirSync(OUT_DIR, { recursive: true });
	writeFileSync(ROSTER_FILE, JSON.stringify(entries, null, '\t'));
	console.log(`[roster] wrote ${entries.length} entries to ${ROSTER_FILE}`);
}

// ---------- phase: emails (info.mzalendo.com) ----------

const MZALENDO = 'https://info.mzalendo.com';

function loadRoster(): RosterEntry[] {
	if (!existsSync(ROSTER_FILE)) {
		throw new Error(`${ROSTER_FILE} not found — run with --roster first.`);
	}
	return JSON.parse(readFileSync(ROSTER_FILE, 'utf8'));
}

function saveRoster(entries: RosterEntry[]) {
	writeFileSync(ROSTER_FILE, JSON.stringify(entries, null, '\t'));
}

/** Best /person/<slug>/ hit for this member on Mzalendo's site search, by name-token
 * overlap between the member's name and each result slug. Requires >= 2 shared tokens
 * (a single shared name like "james" matches half the country). Falls back to a
 * two-token query — full surname-first strings from parliament.go.ke sometimes miss. */
async function searchPerson(entry: RosterEntry): Promise<string | null> {
	const fallback = nameTokens(entry.name).sort((a, b) => b.length - a.length).slice(0, 2).join(' ');
	for (const query of [entry.name, fallback]) {
		const html = await fetchText(`${MZALENDO}/search/?q=${encodeURIComponent(query)}`);
		const slugs = [...new Set([...html.matchAll(/href="\/person\/([a-z0-9-]+)\/"/g)].map((m) => m[1]))];
		let best: { slug: string; score: number } | null = null;
		for (const slug of slugs) {
			const score = tokenOverlap(entry.name, slug.replace(/-/g, ' '));
			if (score >= 2 && (!best || score > best.score)) best = { slug, score };
		}
		if (best) return `${MZALENDO}/person/${best.slug}/`;
		await sleep(DELAY_MS);
	}
	return null;
}

/** Email/phone out of the person page's contact-details sidebar box. */
function parsePerson(html: string, url: string): MzalendoResult {
	const displayName = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
	// Scope to the contact-details box so the newsletter form / footer links don't leak in.
	const box = html.match(/contact-details[\s\S]*?<\/aside>/)?.[0] ?? html.match(/contact-details[\s\S]{0,4000}/)?.[0] ?? '';
	const email = box.match(/mailto:([^"?]+)/)?.[1].trim().toLowerCase();
	const phone = box.match(/href="tel:([^"]+)"/)?.[1].replace(/[^0-9+]/g, '');
	const links = [...box.matchAll(/href="(https?:\/\/[^"]+)"/g)]
		.map((m) => m[1])
		.filter((href) => !/mzalendo|facebook\.com\/sharer|twitter\.com\/share/.test(href));
	return {
		status: 'found',
		url,
		...(displayName ? { name: displayName } : {}),
		...(email ? { email } : {}),
		...(phone ? { phone } : {}),
		...(links.length ? { links } : {}),
		fetchedAt: new Date().toISOString()
	};
}

async function phaseEmails(redoNotFound: boolean) {
	const entries = loadRoster();
	let done = 0;
	for (const entry of entries) {
		// Resumable: skip entries already looked up on a prior run — unless we're
		// re-trying the not-founds after a search improvement (--redo-not-found).
		if (entry.mzalendo && !(redoNotFound && entry.mzalendo.status === 'not-found')) continue;
		try {
			const personUrl = await searchPerson(entry);
			await sleep(DELAY_MS);
			if (!personUrl) {
				entry.mzalendo = { status: 'not-found', fetchedAt: new Date().toISOString() };
			} else {
				entry.mzalendo = parsePerson(await fetchText(personUrl), personUrl);
				await sleep(DELAY_MS);
			}
		} catch (error) {
			console.warn(`[emails] ${entry.name}: ${error instanceof Error ? error.message : error} — will retry on next run`);
			continue; // leave entry.mzalendo unset so a re-run retries it
		}
		done++;
		saveRoster(entries); // checkpoint after every member — safe to Ctrl-C any time
		if (done % 10 === 0) {
			const withEmail = entries.filter((e) => e.mzalendo?.email).length;
			console.log(`[emails] ${done} looked up this run; ${withEmail}/${entries.length} have an email so far`);
		}
	}
	const withEmail = entries.filter((e) => e.mzalendo?.email).length;
	const notFound = entries.filter((e) => e.mzalendo?.status === 'not-found').length;
	console.log(`[emails] finished: ${withEmail}/${entries.length} with email, ${notFound} not found on Mzalendo`);
}

// ---------- phase: import ----------

async function phaseImport() {
	if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
	const client = postgres(process.env.DATABASE_URL, { max: 1 });
	const db = drizzle(client);

	const entries = loadRoster();
	let enriched = 0;
	let created = 0;
	let skippedNoPosition = 0;
	let skippedNameMismatch = 0;

	for (const entry of entries) {
		const mz = entry.mzalendo;
		const [position] = await db
			.select({ id: positions.id })
			.from(positions)
			.where(and(eq(positions.title, entry.seat), eq(positions.region, entry.region), isNull(positions.deletedAt)));
		if (!position) {
			// Nominated members have no geographic seat; a handful of constituencies may
			// also be spelled differently than positions.region — both land here.
			console.warn(`[import] no ${entry.seat} position for "${entry.region}" (${entry.name}) — skipped`);
			skippedNoPosition++;
			continue;
		}

		const contactSource: ContactSource | null = mz?.url
			? { url: mz.url, publisher: 'info.mzalendo.com', fetchedAt: mz.fetchedAt ?? new Date().toISOString() }
			: null;
		const contactRows = [
			...(mz?.email && contactSource ? [{ title: 'Email', value: mz.email, source: contactSource }] : []),
			...(mz?.phone && contactSource ? [{ title: 'Phone', value: mz.phone, source: contactSource }] : [])
		];

		const [holder] = await db
			.select({ leaderId: leaders.id, userId: users.id, firstName: users.firstName, otherNames: users.otherNames })
			.from(leaders)
			.innerJoin(users, eq(leaders.userId, users.id))
			.where(and(eq(leaders.positionId, position.id), eq(leaders.status, 'current'), isNull(leaders.deletedAt)));

		if (holder) {
			// The seat's current holder already has a profile: only attach contacts.
			// Parliament lists SURNAME-first and our DB given-first, so match on shared
			// tokens rather than exact order; zero overlap means the row is someone else.
			const dbName = `${holder.firstName} ${holder.otherNames}`;
			if (tokenOverlap(`${entry.name} ${mz?.name ?? ''}`, dbName) === 0) {
				console.warn(`[import] ${entry.seat} ${entry.region}: roster says "${entry.name}" but DB has "${dbName}" — skipped`);
				skippedNameMismatch++;
				continue;
			}
			for (const row of contactRows) {
				const channel = row.title === 'Email' ? 'email' : 'sms';
				// Never stack a second live row on a channel someone already filled in —
				// scraped data must not fight with what a manager typed or verified.
				const [existing] = await db
					.select({ id: contacts.id })
					.from(contacts)
					.where(and(eq(contacts.userId, holder.userId), eq(contacts.channel, channel), isNull(contacts.deletedAt)));
				if (existing) continue;
				await db
					.insert(contacts)
					.values({ userId: holder.userId, channel, value: row.value, source: row.source })
					.onConflictDoNothing(); // (channel, value) live elsewhere — leave it with its owner
			}
			if (contactRows.length) enriched++;
			continue;
		}

		// No profile on this seat yet: create the whole person via the seed pipeline
		// (auth user + domain user + slug + leaders row + party membership + contacts).
		const personRow: PersonRow = {
			name: mz?.name ?? entry.name, // Mzalendo's given-first form when we have it
			party: entry.party || undefined,
			title: entry.seat,
			region: entry.region,
			status: 'current',
			contacts: contactRows
		};
		await seedPeople(db, [personRow], `scrape:${slugify(entry.name)}`);
		created++;
	}

	console.log(
		`[import] done: ${enriched} existing profiles enriched, ${created} created, ` +
			`${skippedNoPosition} without a matching position, ${skippedNameMismatch} name mismatches`
	);
	await client.end();
}

// ---------- entry ----------

const { values: flags } = parseArgs({
	options: {
		roster: { type: 'boolean', default: false },
		emails: { type: 'boolean', default: false },
		import: { type: 'boolean', default: false },
		'redo-not-found': { type: 'boolean', default: false }
	}
});

const runAll = !flags.roster && !flags.emails && !flags.import;
if (flags.roster || runAll) await phaseRoster();
if (flags.emails || runAll) await phaseEmails(flags['redo-not-found'] ?? false);
if (flags.import) await phaseImport(); // never implied — review scraped-roster.json first
