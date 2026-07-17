// Enriches the curated by-elections register (scripts/data/by-elections-since-2002.csv,
// every seat vacated mid-term since 2002 plus its by-election winner) with each
// person's Wikipedia lead image. The CSV's own bios are kept verbatim - this pass
// fetches photos only, for the people no hand-picked portrait covers.
//
// Cycle labels follow the parliament the partial term sat in (9th-13th; the one
// MCA row gets 'mca-12th'), so build-dossiers merges these into the same dossiers
// as every other sighting of the person.
//
//   bun run scripts/scrape-by-elections.ts
// Output: scripts/out/scraped-by-elections.json (resumable by name).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const WIKI = 'https://en.wikipedia.org';
const CSV_FILE = join(import.meta.dir, 'data', 'by-elections-since-2002.csv');
const OUT_FILE = join(import.meta.dir, 'out', 'scraped-by-elections.json');
const DELAY_MS = 400;

type ByElectionEntry = {
	name: string;
	seat: string; // MP | Senator | MCA
	region: string;
	party: string | null;
	cycle: string; // parliament-era label: '9th'..'13th', 'mca-12th'
	termStartYear: number;
	termEndYear: number;
	reason: string; // why the seat fell vacant (or 'By-election winner')
	bio: string; // CSV bio, verbatim
	articleUrl: string | null;
	photoUrl: string | null;
	fetchedAt: string;
};

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

async function findArticle(name: string): Promise<string | null> {
	const tokens = nameTokens(name);
	const queries = [...new Set([name, tokens.slice(-2).join(' '), `${tokens[0]} ${tokens[tokens.length - 1]}`])].filter(Boolean);
	for (const q of queries) {
		const search = await fetchJson<{ pages: { title: string; description?: string }[] }>(
			`${WIKI}/w/rest.php/v1/search/title?q=${encodeURIComponent(q)}&limit=8`
		);
		let best: { title: string; score: number } | null = null;
		for (const page of search.pages ?? []) {
			const score = tokenOverlap(name, page.title);
			const bump = /politic|governor|senator|minister|member of parliament/i.test(page.description ?? '') ? 0.5 : 0;
			if (score >= 2 && (!best || score + bump > best.score)) best = { title: page.title, score: score + bump };
		}
		if (best) return best.title;
		await sleep(DELAY_MS);
	}
	return null;
}

/** Lead image + intro (the intro is used ONLY to reject same-name strangers). */
async function fetchArticle(title: string): Promise<{ intro: string | null; photoUrl: string | null }> {
	const data = await fetchJson<{ query?: { pages?: Record<string, { extract?: string; original?: { source?: string } }> } }>(
		`${WIKI}/w/api.php?action=query&format=json&prop=extracts|pageimages&exintro=1&explaintext=1&piprop=original&titles=${encodeURIComponent(title)}`
	);
	const page = Object.values(data.query?.pages ?? {})[0];
	return { intro: page?.extract?.trim() || null, photoUrl: page?.original?.source ?? null };
}

/** Minimal CSV parser: quoted fields with embedded commas, no embedded newlines. */
function parseCsv(text: string): Record<string, string>[] {
	const lines = text.trim().split(/\r?\n/);
	const parseLine = (line: string): string[] => {
		const cells: string[] = [];
		let cur = '';
		let inQ = false;
		for (let i = 0; i < line.length; i++) {
			const ch = line[i];
			if (inQ) {
				if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
				else if (ch === '"') inQ = false;
				else cur += ch;
			} else if (ch === '"') inQ = true;
			else if (ch === ',') { cells.push(cur); cur = ''; }
			else cur += ch;
		}
		cells.push(cur);
		return cells;
	};
	const headers = parseLine(lines[0]);
	return lines.slice(1).map((l) => Object.fromEntries(parseLine(l).map((v, i) => [headers[i], v.trim()])));
}

/** Parliament era for a partial term's start year (by-elections happen mid-parliament). */
function cycleFor(seat: string, startYear: number): string {
	// 2007 starters are December-2007 general election winners, so 10th parliament.
	const parliament =
		startYear >= 2022 ? '13th' : startYear >= 2017 ? '12th' : startYear >= 2013 ? '11th' : startYear >= 2007 ? '10th' : '9th';
	return seat === 'MCA' ? `mca-${parliament}` : parliament;
}

const rows = parseCsv(readFileSync(CSV_FILE, 'utf8'));
mkdirSync(join(import.meta.dir, 'out'), { recursive: true });
const previous: ByElectionEntry[] = existsSync(OUT_FILE) ? JSON.parse(readFileSync(OUT_FILE, 'utf8')) : [];
const done = new Map(previous.map((e) => [e.name, e]));

const output: ByElectionEntry[] = [];
for (const row of rows) {
	const name = row['Politician'];
	const startYear = Number(row['Term Start Year']);
	const endYear = Number(row['Term End Year']);
	const base = {
		name,
		seat: row['Seat Title'],
		region: row['Seat Name'].replace(/\s+Ward$/i, ''),
		party: row['Party'] || null,
		cycle: cycleFor(row['Seat Title'], startYear),
		termStartYear: startYear,
		termEndYear: endYear,
		reason: row['Reason for Vacancy'].replace(/^N\/A \(By-election Winner\)$/i, 'By-election winner'),
		bio: row['Bio']
	};
	const prior = done.get(name);
	if (prior && (prior.photoUrl || prior.articleUrl === null)) {
		output.push({ ...prior, ...base, fetchedAt: prior.fetchedAt });
		continue;
	}
	let articleUrl: string | null = null;
	let photoUrl: string | null = null;
	try {
		const title = await findArticle(name);
		if (title) {
			const { intro, photoUrl: img } = await fetchArticle(title);
			// Reject same-name strangers: a real match's intro mentions Kenya, the
			// seat, or the region.
			if (intro && !/kenya|member of parliament|senator/i.test(intro) && !intro.toLowerCase().includes(base.region.toLowerCase())) {
				console.warn(`[by-elections] ${name}: "${title}" intro looks like a different person - discarded`);
			} else {
				articleUrl = `${WIKI}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
				photoUrl = img;
			}
		}
	} catch (error) {
		console.warn(`[by-elections] ${name}: ${error instanceof Error ? error.message : error} - will retry on next run`);
	}
	output.push({ ...base, articleUrl, photoUrl, fetchedAt: new Date().toISOString() });
	writeFileSync(OUT_FILE, JSON.stringify(output, null, '\t'));
	await sleep(DELAY_MS);
}

writeFileSync(OUT_FILE, JSON.stringify(output, null, '\t'));
console.log(
	`[by-elections] done: ${output.length} people (${output.filter((e) => e.photoUrl).length} with wiki photo) -> ${OUT_FILE}`
);
