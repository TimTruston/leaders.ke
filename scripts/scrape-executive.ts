// Harvests Wikipedia bios + photos for the executive seats: Kenya's presidents
// (all five, with real term dates) and the 47 current county governors.
//
// The roster comes from the DB (governors + current president are already seeded);
// the four former presidents are fixed civic facts carried here. Each person is
// matched to their Wikipedia article by title search + name-token overlap, then
// enriched with the article's full intro (action API extracts — longer than the
// REST summary) and its lead image at original resolution.
//
//   bun run scripts/scrape-executive.ts
// Output: scripts/out/scraped-wikipedia-executive.json (resumable by name).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { leaders, positions, users } from '../src/lib/server/db/schema';

const WIKI = 'https://en.wikipedia.org';
const OUT_FILE = join(import.meta.dir, 'out', 'scraped-wikipedia-executive.json');
const DELAY_MS = 400;

type ExecutiveEntry = {
	name: string;
	seat: 'President' | 'Governor';
	region: string; // 'Kenya' for presidents, the county for governors
	status: 'current' | 'former';
	termStart: string | null; // presidents only — governors' terms already sit in the DB
	termEnd: string | null;
	articleUrl: string | null;
	bio: string | null; // the article's full intro, plain text
	photoUrl: string | null; // lead image, original resolution
	fetchedAt: string;
};

// Swearing-in dates; the current president's term is already a DB row.
const FORMER_PRESIDENTS: { name: string; termStart: string; termEnd: string }[] = [
	{ name: 'Jomo Kenyatta', termStart: '1964-12-12', termEnd: '1978-08-22' },
	{ name: 'Daniel arap Moi', termStart: '1978-08-22', termEnd: '2002-12-30' },
	{ name: 'Mwai Kibaki', termStart: '2002-12-30', termEnd: '2013-04-09' },
	{ name: 'Uhuru Kenyatta', termStart: '2013-04-09', termEnd: '2022-09-13' }
];

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson<T>(url: string, tries = 3): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		const res = await fetch(url, { headers: { 'User-Agent': 'leaders.ke profile importer (techytimo@gmail.com)' } });
		if (res.ok) return (await res.json()) as T;
		if (attempt >= tries) throw new Error(`HTTP ${res.status} for ${url}`);
		await sleep(1000 * attempt);
	}
}

function nameTokens(name: string): string[] {
	return name.toLowerCase().replace(/[^a-z\s'-]/g, ' ').split(/\s+/).filter((t) => t.length > 2);
}

function tokenOverlap(a: string, b: string): number {
	const bTokens = new Set(nameTokens(b));
	return nameTokens(a).filter((t) => bTokens.has(t)).length;
}

const HONORIFICS = /\b(prof|dr|hon|eng|amb|mr|mrs|ms|rev|bishop|capt|col|gen|maj|rtd|cpa|fca)\.?\s+/gi;

// Known wrong matches the scoring can't catch: "Mutula Kilonzo Jr" resolves to
// his late father's article (the father's title tokens are a subset of the son's).
const ARTICLE_BLOCKLIST = new Set(['Mutula Kilonzo Jr']);

/** Best-matching article title for a person, or null when nothing plausibly matches.
 * Falls back from the full name to honorific-stripped and token-pair queries — DB
 * names carry titles ("Prof Anyang' Nyong'o") and orderings Wikipedia doesn't. */
async function findArticle(name: string): Promise<string | null> {
	if (ARTICLE_BLOCKLIST.has(name)) return null;
	const cleaned = name.replace(HONORIFICS, '').trim();
	const tokens = nameTokens(cleaned);
	const queries = [
		...new Set([
			name,
			cleaned,
			tokens.slice(-2).join(' '), // last two tokens (surname pair)
			`${tokens[0]} ${tokens[tokens.length - 1]}` // first + last
		])
	].filter(Boolean);

	for (const q of queries) {
		const search = await fetchJson<{ pages: { title: string; description?: string }[] }>(
			`${WIKI}/w/rest.php/v1/search/title?q=${encodeURIComponent(q)}&limit=8`
		);
		let best: { title: string; score: number } | null = null;
		for (const page of search.pages ?? []) {
			const score = tokenOverlap(cleaned, page.title);
			// Prefer politician-described pages on equal name scores.
			const bump = /politic|governor|president|senator|member of parliament/i.test(page.description ?? '') ? 0.5 : 0;
			if (score >= 2 && (!best || score + bump > best.score)) best = { title: page.title, score: score + bump };
		}
		if (best) return best.title;
		await sleep(DELAY_MS);
	}
	return null;
}

/** The article's full plain-text intro + lead image at original resolution. */
async function fetchArticle(title: string): Promise<{ bio: string | null; photoUrl: string | null }> {
	const data = await fetchJson<{
		query?: { pages?: Record<string, { extract?: string; original?: { source?: string } }> };
	}>(
		`${WIKI}/w/api.php?action=query&format=json&prop=extracts|pageimages&exintro=1&explaintext=1&piprop=original&titles=${encodeURIComponent(title)}`
	);
	const page = Object.values(data.query?.pages ?? {})[0];
	return { bio: page?.extract?.trim() || null, photoUrl: page?.original?.source ?? null };
}

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const client = postgres(process.env.DATABASE_URL, { max: 1 });
const db = drizzle(client);

// Roster: every current President/Governor from the DB + the former presidents.
const dbRows = await db
	.select({ firstName: users.firstName, otherNames: users.otherNames, title: positions.title, region: positions.region })
	.from(leaders)
	.innerJoin(users, eq(leaders.userId, users.id))
	.innerJoin(positions, eq(leaders.positionId, positions.id))
	.where(and(eq(leaders.status, 'current'), isNull(leaders.deletedAt)));
const roster: Omit<ExecutiveEntry, 'articleUrl' | 'bio' | 'photoUrl' | 'fetchedAt'>[] = [
	...dbRows
		.filter((r) => r.title === 'President' || r.title === 'Governor')
		.map((r) => ({
			name: `${r.firstName} ${r.otherNames}`,
			seat: r.title as 'President' | 'Governor',
			region: r.region,
			status: 'current' as const,
			termStart: null,
			termEnd: null
		})),
	...FORMER_PRESIDENTS.map((p) => ({
		name: p.name,
		seat: 'President' as const,
		region: 'Kenya',
		status: 'former' as const,
		termStart: p.termStart,
		termEnd: p.termEnd
	}))
];

mkdirSync(join(import.meta.dir, 'out'), { recursive: true });
const previous: ExecutiveEntry[] = existsSync(OUT_FILE) ? JSON.parse(readFileSync(OUT_FILE, 'utf8')) : [];
const done = new Map(previous.filter((e) => e.bio || e.photoUrl).map((e) => [e.name, e]));

const output: ExecutiveEntry[] = [];
for (const person of roster) {
	const prior = done.get(person.name);
	if (prior) {
		output.push({ ...prior, ...person, fetchedAt: prior.fetchedAt });
		continue;
	}
	let articleUrl: string | null = null;
	let bio: string | null = null;
	let photoUrl: string | null = null;
	try {
		const title = await findArticle(person.name);
		if (title) {
			articleUrl = `${WIKI}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
			({ bio, photoUrl } = await fetchArticle(title));
		}
	} catch (error) {
		console.warn(`[executive] ${person.name}: ${error instanceof Error ? error.message : error} — will retry on next run`);
	}
	output.push({ ...person, articleUrl, bio, photoUrl, fetchedAt: new Date().toISOString() });
	writeFileSync(OUT_FILE, JSON.stringify(output, null, '\t'));
	await sleep(DELAY_MS);
}

writeFileSync(OUT_FILE, JSON.stringify(output, null, '\t'));
const withBio = output.filter((e) => e.bio).length;
const withPhoto = output.filter((e) => e.photoUrl).length;
console.log(`[executive] done: ${output.length} people (${withBio} with bio, ${withPhoto} with photo) -> ${OUT_FILE}`);
await client.end();
