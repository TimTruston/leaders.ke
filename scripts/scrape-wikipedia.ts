// Harvests the 13th Parliament of Kenya from Wikipedia: the constituency-MP and
// senator wikitables, then each linked member article's REST summary for a bio
// extract and photo thumbnail. Cross-validates the parliament.go.ke roster and
// fills bios/photos Mzalendo lacks. Wikipedia publishes no contact details.
//
//   bun run scripts/scrape-wikipedia.ts
//
// Output: scripts/out/scraped-wikipedia-13th.json (resumable — members whose
// article summary is already fetched are skipped on re-run).
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeEntities } from './lib/names';

const WIKI = 'https://en.wikipedia.org';
const PAGE = `${WIKI}/wiki/13th_Parliament_of_Kenya`;
const OUT_FILE = join(import.meta.dir, 'out', 'scraped-wikipedia-13th.json');
const DELAY_MS = 300; // REST summaries are cheap, cached endpoints

type WikiMember = {
	name: string;
	seat: 'MP' | 'Woman Rep' | 'Senator';
	region: string; // constituency (MP) or county (Woman Rep / Senator)
	party: string;
	articleUrl: string | null; // null = red link / no Wikipedia article
	bio: string | null; // article summary extract
	photoUrl: string | null; // article thumbnail
	fetchedAt: string;
};

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url: string, tries = 3): Promise<string> {
	for (let attempt = 1; ; attempt++) {
		const res = await fetch(url, { headers: { 'User-Agent': 'leaders.ke profile importer (techytimo@gmail.com)' } });
		if (res.ok) return await res.text();
		if (attempt >= tries) throw new Error(`HTTP ${res.status} for ${url}`);
		await sleep(1000 * attempt);
	}
}

function stripTags(html: string): string {
	return decodeEntities(html.replace(/<[^>]+>/g, ' '))
		.replace(/\[[^\]]*\]/g, '') // citation markers rendered as "[ 4 ]"
		.replace(/\s+/g, ' ')
		.trim();
}

/** A cell's text plus its first non-redlink article URL. Wikipedia serves hrefs
 * as either "/wiki/X" or the Parsoid "//en.wikipedia.org/wiki/X" form. */
function cellWithLink(cellHtml: string): { text: string; article: string | null } {
	const m = cellHtml.match(/href="(?:https?:)?(?:\/\/en\.wikipedia\.org)?(\/wiki\/[^"?#]+)"/);
	const isRed = /redlink=1/.test(cellHtml);
	return { text: stripTags(cellHtml), article: !isRed && m ? m[1] : null };
}

function parseTables(html: string): WikiMember[] {
	const members: WikiMember[] = [];
	const tables = html.match(/<table class="[^"]*wikitable[^"]*"[\s\S]*?<\/table>/g) ?? [];
	// Two county-seat tables share the Code/County/Name/Party header: the National
	// Assembly's Woman Representatives table appears first, the Senators table second.
	let countyTableIndex = 0;
	for (const table of tables) {
		const headers = [...table.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => stripTags(m[1]));
		const isMps = headers[0] === 'Constituency' && headers[1] === 'MP';
		const isCountySeat = headers[0] === 'Code' && headers[2] === 'Name';
		if (!isMps && !isCountySeat) continue;
		const seat: WikiMember['seat'] = isMps ? 'MP' : countyTableIndex++ === 0 ? 'Woman Rep' : 'Senator';
		for (const rowMatch of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
			const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
			if (cells.length < 3) continue; // header row
			const [regionCell, nameCell, partyCell] = isMps
				? [cells[0], cells[1], cells[2]]
				: [cells[1], cells[2], cells[3]];
			const name = cellWithLink(nameCell);
			if (!name.text) continue;
			// The senators section repeats as elected + nominated tables — keep one row per person+seat.
			if (members.some((m) => m.name === name.text && m.region === stripTags(regionCell))) continue;
			members.push({
				name: name.text,
				seat,
				region: stripTags(regionCell),
				party: stripTags(partyCell ?? ''),
				articleUrl: name.article ? `${WIKI}${name.article}` : null,
				bio: null,
				photoUrl: null,
				fetchedAt: new Date().toISOString()
			});
		}
	}
	return members;
}

/** Article summary via the REST API: plain-text extract + lead-image thumbnail. */
async function fetchSummary(articleUrl: string): Promise<{ bio: string | null; photoUrl: string | null }> {
	const title = articleUrl.split('/wiki/')[1];
	const raw = await fetchText(`${WIKI}/api/rest_v1/page/summary/${title}`);
	const summary = JSON.parse(raw) as { extract?: string; thumbnail?: { source?: string } };
	return { bio: summary.extract || null, photoUrl: summary.thumbnail?.source ?? null };
}

mkdirSync(join(import.meta.dir, 'out'), { recursive: true });

// Table parse is cheap — always fresh; article summaries resume from the existing file.
const previous: WikiMember[] = existsSync(OUT_FILE) ? JSON.parse(readFileSync(OUT_FILE, 'utf8')) : [];
const done = new Map(previous.filter((m) => m.bio || m.photoUrl).map((m) => [m.articleUrl, m]));

const members = parseTables(await fetchText(PAGE));
console.log(`[wikipedia] parsed ${members.filter((m) => m.seat === 'MP').length} MPs + ${members.filter((m) => m.seat === 'Senator').length} Senators`);

let fetched = 0;
for (const member of members) {
	if (!member.articleUrl) continue;
	const prior = done.get(member.articleUrl);
	if (prior) {
		member.bio = prior.bio;
		member.photoUrl = prior.photoUrl;
		continue;
	}
	try {
		const { bio, photoUrl } = await fetchSummary(member.articleUrl);
		member.bio = bio;
		member.photoUrl = photoUrl;
	} catch (error) {
		console.warn(`[wikipedia] ${member.name}: ${error instanceof Error ? error.message : error}`);
	}
	fetched++;
	if (fetched % 25 === 0) {
		writeFileSync(OUT_FILE, JSON.stringify(members, null, '\t'));
		console.log(`[wikipedia] ${fetched} article summaries fetched`);
	}
	await sleep(DELAY_MS);
}

writeFileSync(OUT_FILE, JSON.stringify(members, null, '\t'));
const withArticle = members.filter((m) => m.articleUrl).length;
const withBio = members.filter((m) => m.bio).length;
const withPhoto = members.filter((m) => m.photoUrl).length;
console.log(`[wikipedia] done: ${members.length} members (${withArticle} with article, ${withBio} with bio, ${withPhoto} with photo) -> ${OUT_FILE}`);
