// Harvests kiongozi.online civic candidate profiles (photo, education, experience
// with free-text descriptions) for the 2027 presidential candidates. kiongozi is a
// Next.js app: the profile JSON ships inside self.__next_f.push flight chunks, so
// we join + unescape the chunks and bracket-match the arrays out of the stream.
//
// Volunteer-submitted, so quality varies (several profiles mash all roles into one
// entry). The output is raw source material: the curated leaders.json rewrites are
// derived from it (plus Wikipedia where this is thin or conflicting), never pasted.
//
//   bun run scripts/scrape-kiongozi.ts
// Output: scripts/out/scraped-kiongozi.json (resumable by slug).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT_FILE = join(import.meta.dir, 'out', 'scraped-kiongozi.json');
const DELAY_MS = 800;

// kiongozi slug -> our platform slug. Probed by hand: the four former presidents
// have no kiongozi profile (it only covers 2027 candidates).
const CANDIDATES: { kiongoziSlug: string; platformSlug: string }[] = [
	{ kiongoziSlug: 'martha-karua', platformSlug: 'martha-karua' },
	{ kiongoziSlug: 'kalonzo-musyoka', platformSlug: 'kalonzo-musyoka' },
	{ kiongoziSlug: 'fred-matiangi', platformSlug: 'fred-matiangi' },
	{ kiongoziSlug: 'boniface-mwangi', platformSlug: 'boniface-mwangi' },
	{ kiongoziSlug: 'david-maraga', platformSlug: 'david-maraga' },
	{ kiongoziSlug: 'william-ruto', platformSlug: 'william-ruto' },
	{ kiongoziSlug: 'jimi-wanjigi', platformSlug: 'jimi-richard-wanjigi' }
];

type KiongoziEntry = {
	kiongoziSlug: string;
	platformSlug: string;
	url: string;
	photoUrl: string | null;
	education: Record<string, unknown>[];
	experience: Record<string, unknown>[];
	fetchedAt: string;
};

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Joins the page's __next_f flight chunks into one unescaped JSON-ish stream. */
function flightBlob(html: string): string {
	const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,"(.*?)"\]\)/gs)].map((m) => m[1]);
	return chunks.map((c) => JSON.parse(`"${c}"`) as string).join('');
}

/** Bracket-matches the `"key":[...]` array out of the stream and parses it. */
function extractArray(blob: string, key: string): Record<string, unknown>[] {
	const at = blob.indexOf(`"${key}":[`);
	if (at < 0) return [];
	const start = blob.indexOf('[', at);
	let depth = 0;
	let inString = false;
	for (let i = start; i < blob.length; i++) {
		const ch = blob[i];
		if (inString) {
			if (ch === '\\') i++;
			else if (ch === '"') inString = false;
		} else if (ch === '"') inString = true;
		else if (ch === '[') depth++;
		else if (ch === ']' && --depth === 0) return JSON.parse(blob.slice(start, i + 1));
	}
	return [];
}

mkdirSync(join(import.meta.dir, 'out'), { recursive: true });
const previous: KiongoziEntry[] = existsSync(OUT_FILE) ? JSON.parse(readFileSync(OUT_FILE, 'utf8')) : [];
const done = new Map(previous.filter((e) => e.education.length || e.experience.length).map((e) => [e.kiongoziSlug, e]));

const output: KiongoziEntry[] = [];
for (const { kiongoziSlug, platformSlug } of CANDIDATES) {
	const prior = done.get(kiongoziSlug);
	if (prior) {
		output.push(prior);
		continue;
	}
	const url = `https://kiongozi.online/candidate/${kiongoziSlug}`;
	try {
		const res = await fetch(url, { headers: { 'User-Agent': 'leaders.ke profile importer (techytimo@gmail.com)' } });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const blob = flightBlob(await res.text());
		output.push({
			kiongoziSlug,
			platformSlug,
			url,
			photoUrl: blob.match(/"photo_url":"(https:[^"]+)"/)?.[1] ?? null,
			education: extractArray(blob, 'education'),
			experience: extractArray(blob, 'experience'),
			fetchedAt: new Date().toISOString()
		});
	} catch (error) {
		console.warn(`[kiongozi] ${kiongoziSlug}: ${error instanceof Error ? error.message : error} - will retry on next run`);
	}
	writeFileSync(OUT_FILE, JSON.stringify(output, null, '\t'));
	await sleep(DELAY_MS);
}

writeFileSync(OUT_FILE, JSON.stringify(output, null, '\t'));
console.log(
	`[kiongozi] done: ${output.length} candidates (${output.reduce((n, e) => n + e.education.length + e.experience.length, 0)} entries) -> ${OUT_FILE}`
);
