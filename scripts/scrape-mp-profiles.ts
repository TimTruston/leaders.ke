// Harvests National Assembly member profiles (bio, photo, seat facts, committees)
// from mzalendo.com's MP-performance pages into one JSON file per parliament:
//   scripts/out/scraped-mps-13th.json   (current members)
//   scripts/out/scraped-mps-12th.json
//   scripts/out/scraped-mps-11th.json
//   scripts/out/scraped-mps-earlier.json (the few 8th-10th member pages that exist)
//
// The listing pages for the 8th-10th parliaments no longer exist on mzalendo.com, so
// discovery is sitemap-driven: every member URL under /mps-performance/national-assembly/
// is grouped by its parliament segment. Resumable — already-scraped slugs are skipped,
// and the file is checkpointed as it goes, so Ctrl-C and re-run is always safe.
//
//   bun run scripts/scrape-mp-profiles.ts                # all parliaments
//   bun run scripts/scrape-mp-profiles.ts --only 13th    # one file
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeEntities } from './lib/names';
import { parseArgs } from 'node:util';

const MZALENDO = 'https://mzalendo.com';
const OUT_DIR = join(import.meta.dir, 'out');
const DELAY_MS = 800;

type MpProfile = {
	slug: string;
	url: string;
	name: string;
	constituency: string | null;
	/** Women's Representatives carry a County fact instead of a Constituency. */
	county: string | null;
	party: string | null;
	status: string | null; // Elected | Nominated | ...
	term: string | null; // "Present" or the term's years
	/** "Official Background" text; null when Mzalendo has no verified biography yet. */
	bio: string | null;
	photoUrl: string | null;
	committees: string[];
	fetchedAt: string;
};

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url: string, tries = 4): Promise<string> {
	for (let attempt = 1; ; attempt++) {
		try {
			const res = await fetch(url, { headers: { 'User-Agent': 'leaders.ke profile importer (techytimo@gmail.com)' } });
			if (res.ok) return await res.text();
			if (attempt >= tries) throw new Error(`HTTP ${res.status}`);
		} catch (error) {
			if (attempt >= tries) throw error instanceof Error ? error : new Error(String(error));
		}
		await sleep(1500 * attempt);
	}
}

function stripTags(html: string): string {
	return decodeEntities(html.replace(/<[^>]+>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim();
}

/** One profile-hero fact by its label ("Constituency", "Party", "Status", "Term"). */
function fact(html: string, label: string): string | null {
	const m = html.match(new RegExp(`fact__label">${label}</span>\\s*<span class="fact__value">([\\s\\S]*?)</span>\\s*</div>`));
	const value = m ? stripTags(m[1]) : '';
	return value || null;
}

function parseProfile(html: string, url: string): MpProfile {
	const slug = url.replace(/\/$/, '').split('/').pop() as string;
	const name = stripTags(html.match(/profile-hero__name">([\s\S]*?)<\/h1>/)?.[1] ?? '');

	// "Official Background" section: the verified biography sits in a
	// biography-content div (the section ALSO carries a profile-note — either
	// "not yet available" or a "Verified against source" citation, so the note's
	// presence says nothing about whether a bio exists).
	const bioSection = html.match(/member-background[\s\S]*?<\/section>/)?.[0] ?? '';
	const bio =
		[...bioSection.matchAll(/<div class="biography-content">([\s\S]*?)<\/div>/g)]
			.map((m) => stripTags(m[1]))
			.filter(Boolean)
			.join('\n\n') || null;

	const photoPath = html.match(/<img src="(\/media\/images-rendered\/[^"]+)"/)?.[1];

	const committees = [...new Set(
		[...html.matchAll(/of the\s*(?:<[^>]+>\s*)*([^<]+?)(?:\s*<[^>]+>)*\s*committee/gi)]
			.map((m) => stripTags(m[1]))
			.filter((name) => name && !/parliament$/i.test(name)) // "A member of the 13th Parliament ..." is not a committee
	)];

	return {
		slug,
		url,
		name,
		constituency: fact(html, 'Constituency'),
		county: fact(html, 'County'),
		party: fact(html, 'Party'),
		status: fact(html, 'Status'),
		term: fact(html, 'Term'),
		bio,
		photoUrl: photoPath ? `${MZALENDO}${photoPath}` : null,
		committees,
		fetchedAt: new Date().toISOString()
	};
}

/** Sitemap member URLs grouped by chamber+parliament: NA 13th/12th/11th by URL
 * segment, senate ones prefixed "senate-", and top-level member-*-10th style
 * pages into "earlier". */
async function memberUrlsByParliament(): Promise<Map<string, string[]>> {
	const xml = await fetchText(`${MZALENDO}/sitemap.xml`);
	const groups = new Map<string, string[]>();
	for (const m of xml.matchAll(/<loc>(https:\/\/mzalendo\.com\/mps-performance\/(?:national-assembly|senate)\/[^<]+)<\/loc>/g)) {
		const url = m[1];
		const senate = url.includes('/senate/');
		const segments = url.replace(/\/$/, '').split('/');
		if (segments.length < 6) continue; // the chamber index itself
		const [, parliament, slug] = [segments[3], segments[5], segments[6]];
		let key: string;
		let memberUrl = url;
		if (slug && /^1[123]th-parliament$/.test(parliament)) {
			key = (senate ? 'senate-' : '') + parliament.replace('-parliament', '');
		} else if (!senate && !slug && /^member-.*-(8|9|10)th$/.test(parliament)) {
			// 8th-10th members are listed top-level in the sitemap, but the live pages
			// sit under their parliament segment: member-x-8th -> /8th-parliament-na/member-x-8th/
			const n = parliament.match(/-(8|9|10)th$/)![1];
			key = 'earlier';
			memberUrl = url.replace(`/national-assembly/${parliament}`, `/national-assembly/${n}th-parliament-na/${parliament}`);
		} else {
			continue; // listing pages and non-member strays
		}
		groups.set(key, [...(groups.get(key) ?? []), memberUrl]);
	}
	return groups;
}

async function scrapeParliament(key: string, urls: string[]) {
	const file = join(OUT_DIR, `scraped-mps-${key}.json`);
	const existing: MpProfile[] = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
	const done = new Set(existing.map((p) => p.url));
	const profiles = [...existing];
	let scraped = 0;

	for (const url of urls) {
		if (done.has(url)) continue;
		try {
			profiles.push(parseProfile(await fetchText(url), url));
		} catch (error) {
			console.warn(`[${key}] ${url}: ${error instanceof Error ? error.message : error} — will retry on next run`);
			await sleep(DELAY_MS);
			continue;
		}
		scraped++;
		if (scraped % 10 === 0) {
			writeFileSync(file, JSON.stringify(profiles, null, '\t'));
			console.log(`[${key}] ${profiles.length}/${urls.length} scraped`);
		}
		await sleep(DELAY_MS);
	}

	writeFileSync(file, JSON.stringify(profiles, null, '\t'));
	const withBio = profiles.filter((p) => p.bio).length;
	const withPhoto = profiles.filter((p) => p.photoUrl).length;
	console.log(`[${key}] done: ${profiles.length} profiles (${withBio} with bio, ${withPhoto} with photo) -> ${file}`);
}

const { values: flags } = parseArgs({ options: { only: { type: 'string' } } });

mkdirSync(OUT_DIR, { recursive: true });
const groups = await memberUrlsByParliament();
// Current parliament first — those are the profiles the platform needs soonest.
const order = ['13th', '12th', '11th', 'earlier', 'senate-13th', 'senate-12th', 'senate-11th'].filter(
	(k) => groups.has(k) && (!flags.only || k === flags.only)
);
for (const key of order) {
	console.log(`[${key}] ${groups.get(key)!.length} member pages`);
	await scrapeParliament(key, groups.get(key)!);
}
