// Harvests past-parliament rosters from Wikipedia into one JSON per parliament:
//   scraped-wikipedia-12th.json (2017-2022), scraped-wikipedia-11th.json (2013-2017),
//   scraped-wikipedia-9th.json (2003-2007).
// The 10th and 8th parliaments have no Wikipedia member list (checked), and
// mzalendo.com only keeps ~20 stray member pages for them.
//
// Same output shape as scrape-wikipedia.ts (13th): name, seat, region, party,
// articleUrl, bio + photo from each linked article's REST summary. Nominated-member
// and by-election tables are skipped (see the non-elected.json policy).
//
//   bun run scripts/scrape-wikipedia-past.ts
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const WIKI = 'https://en.wikipedia.org';
const OUT_DIR = join(import.meta.dir, 'out');
const DELAY_MS = 300;

type WikiMember = {
	name: string;
	seat: 'MP' | 'Woman Rep';
	region: string;
	party: string;
	articleUrl: string | null;
	bio: string | null;
	photoUrl: string | null;
	fetchedAt: string;
};

// Which wikitable is which, identified by its header cells. Column positions are
// taken from the row END (party last, member second-to-last, region third-to-last):
// county-grouped tables use rowspans, so row STARTS shift while the tail stays fixed.
type TableSpec = { headerHas: string[]; seat: WikiMember['seat'] };
type PageSpec = { key: string; path: string; tables: TableSpec[] };

const PAGES: PageSpec[] = [
	{
		key: '12th',
		path: '/wiki/List_of_members_of_the_National_Assembly_of_Kenya,_2017%E2%80%932022',
		tables: [
			{ headerHas: ['Constituency', 'Member'], seat: 'MP' },
			{ headerHas: ['County', 'Member'], seat: 'Woman Rep' }
		]
	},
	{
		key: '11th',
		path: '/wiki/List_of_members_of_the_National_Assembly_of_Kenya_(2013%E2%80%9318)',
		tables: [
			{ headerHas: ['Constituency', 'Representative-elect'], seat: 'MP' },
			{ headerHas: ['County No', 'Representative-elect'], seat: 'Woman Rep' }
		]
	},
	{
		key: '9th',
		path: '/wiki/9th_Parliament_of_Kenya',
		tables: [{ headerHas: ['Constituency', 'MP'], seat: 'MP' }]
	}
];

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
	return html
		.replace(/<[^>]+>/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&#0?39;/g, "'")
		.replace(/\[[^\]]*\]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function cellWithLink(cellHtml: string): { text: string; article: string | null } {
	const m = cellHtml.match(/href="(?:https?:)?(?:\/\/en\.wikipedia\.org)?(\/wiki\/[^"?#]+)"/);
	const isRed = /redlink=1/.test(cellHtml);
	return { text: stripTags(cellHtml), article: !isRed && m ? m[1] : null };
}

function parsePage(html: string, spec: PageSpec): WikiMember[] {
	const members: WikiMember[] = [];
	for (const table of html.match(/<table class="[^"]*wikitable[^"]*"[\s\S]*?<\/table>/g) ?? []) {
		const headers = [...table.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => stripTags(m[1]));
		const tableSpec = spec.tables.find((t) => t.headerHas.every((h) => headers.some((x) => x.startsWith(h))));
		if (!tableSpec) continue;
		for (const rowMatch of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
			const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
			if (cells.length < 3) continue;
			const name = cellWithLink(cells[cells.length - 2]);
			const region = stripTags(cells[cells.length - 3]);
			if (!name.text || !region) continue;
			if (members.some((m) => m.name === name.text && m.region === region && m.seat === tableSpec.seat)) continue;
			members.push({
				name: name.text,
				seat: tableSpec.seat,
				region,
				party: stripTags(cells[cells.length - 1] ?? ''),
				articleUrl: name.article ? `${WIKI}${name.article}` : null,
				bio: null,
				photoUrl: null,
				fetchedAt: new Date().toISOString()
			});
		}
	}
	return members;
}

async function fetchSummary(articleUrl: string): Promise<{ bio: string | null; photoUrl: string | null }> {
	const title = articleUrl.split('/wiki/')[1];
	const raw = await fetchText(`${WIKI}/api/rest_v1/page/summary/${title}`);
	const summary = JSON.parse(raw) as { extract?: string; thumbnail?: { source?: string } };
	return { bio: summary.extract || null, photoUrl: summary.thumbnail?.source ?? null };
}

mkdirSync(OUT_DIR, { recursive: true });

for (const spec of PAGES) {
	const outFile = join(OUT_DIR, `scraped-wikipedia-${spec.key}.json`);
	const previous: WikiMember[] = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : [];
	const done = new Map(previous.filter((m) => m.bio || m.photoUrl).map((m) => [m.articleUrl, m]));

	const members = parsePage(await fetchText(`${WIKI}${spec.path}`), spec);
	console.log(`[${spec.key}] parsed ${members.filter((m) => m.seat === 'MP').length} MPs + ${members.filter((m) => m.seat === 'Woman Rep').length} Woman Reps`);

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
			console.warn(`[${spec.key}] ${member.name}: ${error instanceof Error ? error.message : error}`);
		}
		fetched++;
		if (fetched % 50 === 0) {
			writeFileSync(outFile, JSON.stringify(members, null, '\t'));
			console.log(`[${spec.key}] ${fetched} article summaries fetched`);
		}
		await sleep(DELAY_MS);
	}

	writeFileSync(outFile, JSON.stringify(members, null, '\t'));
	const withArticle = members.filter((m) => m.articleUrl).length;
	const withBio = members.filter((m) => m.bio).length;
	const withPhoto = members.filter((m) => m.photoUrl).length;
	console.log(`[${spec.key}] done: ${members.length} members (${withArticle} with article, ${withBio} with bio, ${withPhoto} with photo) -> ${outFile}`);
}
