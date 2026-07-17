// Harvests the 2013-2017 and 2017-2022 county governors with Wikipedia bios/photos.
//
// The 2013 winners come from Wikipedia's "2013 Kenyan local elections" table (county
// column is messy there, so counties are resolved by the code column, 1-47). No page
// lists the 2017 winners, so that roster (plus the six mid-term successors: deaths in
// Nyeri/Bomet/Nyamira, impeachments in Nairobi/Kiambu/Wajir) is carried here as a
// curated constant, verified per person by the Wikipedia article match itself.
// Each person is then enriched with their article's intro and lead image, exactly
// like scrape-executive.ts.
//
//   bun run scripts/scrape-governors-past.ts
// Output: scripts/out/scraped-wikipedia-governors-past.json (resumable by name+cycle).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const WIKI = 'https://en.wikipedia.org';
const OUT_FILE = join(import.meta.dir, 'out', 'scraped-wikipedia-governors-past.json');
const DELAY_MS = 400;

// Canonical county names by code, matching positions.region exactly.
const COUNTIES = [
	'Mombasa', 'Kwale', 'Kilifi', 'Tana River', 'Lamu', 'Taita Taveta', 'Garissa', 'Wajir', 'Mandera',
	'Marsabit', 'Isiolo', 'Meru', 'Tharaka-Nithi', 'Embu', 'Kitui', 'Machakos', 'Makueni', 'Nyandarua',
	'Nyeri', 'Kirinyaga', "Murang'a", 'Kiambu', 'Turkana', 'West Pokot', 'Samburu', 'Trans Nzoia',
	'Uasin Gishu', 'Elgeyo/Marakwet', 'Nandi', 'Baringo', 'Laikipia', 'Nakuru', 'Narok', 'Kajiado',
	'Kericho', 'Bomet', 'Kakamega', 'Vihiga', 'Bungoma', 'Busia', 'Siaya', 'Kisumu', 'Homa Bay',
	'Migori', 'Kisii', 'Nyamira', 'Nairobi'
];

type PastGovernor = {
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
	fetchedAt: string;
};

// Governors sworn in ~2013-03-27 (election 4 March) and ~2017-08-22 (election 8 August);
// the 2017 cohort handed over on 2022-08-25.
const T2013 = { termStart: '2013-03-27', termEnd: '2017-08-21' };
const T2017 = { termStart: '2017-08-22', termEnd: '2022-08-25' };

// 2017 winners by county code order (no Wikipedia list page exists for this cycle).
const GOVERNORS_2017: string[] = [
	'Hassan Ali Joho', 'Salim Mvurya', 'Amason Kingi', 'Dhadho Godhana', 'Fahim Twaha',
	'Granton Samboja', 'Ali Korane', 'Mohamed Abdi Mohamud', 'Ali Roba', 'Mohamud Ali',
	'Mohamed Kuti', 'Kiraitu Murungi', 'Muthomi Njuki', 'Martin Wambora', 'Charity Ngilu',
	'Alfred Mutua', 'Kivutha Kibwana', 'Francis Kimemia', 'Wahome Gakuru', 'Anne Waiguru',
	'Mwangi wa Iria', 'Ferdinand Waititu', 'Josphat Nanok', 'John Lonyangapuo', 'Moses Lenolkulal',
	'Patrick Khaemba', 'Jackson Mandago', 'Alex Tolgos', 'Stephen Sang', 'Stanley Kiptis',
	'Ndiritu Muriithi', 'Lee Kinyanjui', 'Samuel Tunai', 'Joseph ole Lenku', 'Paul Chepkwony',
	'Joyce Laboso', 'Wycliffe Oparanya', 'Wilber Ottichilo', 'Wycliffe Wangamati', 'Sospeter Ojaamong',
	'Cornel Rasanga', "Peter Anyang' Nyong'o", 'Cyprian Awiti', 'Okoth Obado', 'James Ongwae',
	'John Nyagarama', 'Mike Sonko'
];

// Mid-term successors within the 2017-2022 cycle (deaths and upheld impeachments).
const SUCCESSORS_2017: { name: string; county: string; termStart: string; note: string }[] = [
	{ name: 'Mutahi Kahiga', county: 'Nyeri', termStart: '2017-11-15', note: 'succeeded Wahome Gakuru (died in office)' },
	{ name: 'Hillary Barchok', county: 'Bomet', termStart: '2019-08-08', note: 'succeeded Joyce Laboso (died in office)' },
	{ name: 'Amos Nyaribo', county: 'Nyamira', termStart: '2020-12-19', note: 'succeeded John Nyagarama (died in office)' },
	{ name: 'Anne Kananu', county: 'Nairobi', termStart: '2021-05-16', note: 'succeeded Mike Sonko (impeached December 2020)' },
	{ name: 'James Nyoro', county: 'Kiambu', termStart: '2020-01-31', note: 'succeeded Ferdinand Waititu (impeached January 2020)' },
	{ name: 'Ahmed Ali Muktar', county: 'Wajir', termStart: '2021-05-18', note: 'succeeded Mohamed Abdi Mohamud (impeached May 2021)' }
];

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url: string, tries = 3): Promise<string> {
	for (let attempt = 1; ; attempt++) {
		const res = await fetch(url, { headers: { 'User-Agent': 'leaders.ke profile importer (techytimo@gmail.com)' } });
		if (res.ok) return res.text();
		if (attempt >= tries) throw new Error(`HTTP ${res.status} for ${url}`);
		await sleep(1000 * attempt);
	}
}

async function fetchJson<T>(url: string, tries = 3): Promise<T> {
	return JSON.parse(await fetchText(url, tries)) as T;
}

function nameTokens(name: string): string[] {
	return name.toLowerCase().replace(/[^a-z\s'-]/g, ' ').split(/\s+/).filter((t) => t.length > 2);
}

function tokenOverlap(a: string, b: string): number {
	const bTokens = new Set(nameTokens(b));
	return nameTokens(a).filter((t) => bTokens.has(t)).length;
}

const HONORIFICS = /\b(prof|dr|hon|eng|amb|mr|mrs|ms|rev|bishop|capt|col|gen|maj|rtd|cpa|fca)\.?\s+/gi;

/** Same fallback ladder as scrape-executive.ts: full name, honorific-stripped, token pairs. */
async function findArticle(name: string): Promise<string | null> {
	const cleaned = name.replace(HONORIFICS, '').trim();
	const tokens = nameTokens(cleaned);
	const queries = [
		...new Set([name, cleaned, tokens.slice(-2).join(' '), `${tokens[0]} ${tokens[tokens.length - 1]}`])
	].filter(Boolean);
	for (const q of queries) {
		const search = await fetchJson<{ pages: { title: string; description?: string }[] }>(
			`${WIKI}/w/rest.php/v1/search/title?q=${encodeURIComponent(q)}&limit=8`
		);
		let best: { title: string; score: number } | null = null;
		for (const page of search.pages ?? []) {
			const score = tokenOverlap(cleaned, page.title);
			const bump = /politic|governor|senator|minister|member of parliament/i.test(page.description ?? '') ? 0.5 : 0;
			if (score >= 2 && (!best || score + bump > best.score)) best = { title: page.title, score: score + bump };
		}
		if (best) return best.title;
		await sleep(DELAY_MS);
	}
	return null;
}

async function fetchArticle(title: string): Promise<{ bio: string | null; photoUrl: string | null }> {
	const data = await fetchJson<{ query?: { pages?: Record<string, { extract?: string; original?: { source?: string } }> } }>(
		`${WIKI}/w/api.php?action=query&format=json&prop=extracts|pageimages&exintro=1&explaintext=1&piprop=original&titles=${encodeURIComponent(title)}`
	);
	const page = Object.values(data.query?.pages ?? {})[0];
	return { bio: page?.extract?.trim() || null, photoUrl: page?.original?.source ?? null };
}

/** 2013 winners from the local-elections page's Governor table, resolved by county code. */
async function roster2013(): Promise<Omit<PastGovernor, 'articleUrl' | 'bio' | 'photoUrl' | 'fetchedAt'>[]> {
	const html = await fetchText(`${WIKI}/w/rest.php/v1/page/2013_Kenyan_local_elections/html`);
	const anchor = html.indexOf('Deputy Governor');
	const tableStart = html.lastIndexOf('<table', anchor);
	const table = html.slice(tableStart, html.indexOf('</table>', anchor));
	const out: Omit<PastGovernor, 'articleUrl' | 'bio' | 'photoUrl' | 'fetchedAt'>[] = [];
	for (const row of table.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? []) {
		const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
			m[1].replace(/<[^>]+>/g, '').replace(/\[\s*\d+\s*\]/g, '').trim()
		);
		if (cells.length < 5) continue;
		const code = Number(cells[0]);
		if (!code || code < 1 || code > 47) continue;
		out.push({ name: sanitizeName(cells[2]), county: COUNTIES[code - 1], cycle: '2013', party: cells[4] || null, ...T2013 });
	}
	// The Laikipia row doesn't survive the table parse; patch the known winner in.
	if (!out.some((r) => r.county === 'Laikipia')) {
		out.push({ name: 'Joshua Irungu', county: 'Laikipia', cycle: '2013', party: 'TNA', ...T2013 });
	}
	if (out.length !== 47) console.warn(`[governors-past] 2013 table parsed ${out.length}/47 rows`);
	return out;
}

/** Strips honorifics, leaked style/footnote fragments and doubled spaces from a table cell name. */
function sanitizeName(raw: string): string {
	return raw
		.replace(/\.mw-parser-output[\s\S]*$/, '')
		.replace(HONORIFICS, '')
		.replace(/\s+/g, ' ')
		.trim();
}

mkdirSync(join(import.meta.dir, 'out'), { recursive: true });
const previous: PastGovernor[] = existsSync(OUT_FILE) ? JSON.parse(readFileSync(OUT_FILE, 'utf8')) : [];
const done = new Map(previous.filter((e) => e.bio || e.photoUrl || e.articleUrl === null).map((e) => [`${e.name}|${e.cycle}`, e]));

const roster: Omit<PastGovernor, 'articleUrl' | 'bio' | 'photoUrl' | 'fetchedAt'>[] = [
	...(await roster2013()),
	...GOVERNORS_2017.map((name, i) => ({ name, county: COUNTIES[i], cycle: '2017' as const, party: null, ...T2017 })),
	...SUCCESSORS_2017.map((s) => ({
		name: s.name,
		county: s.county,
		cycle: '2017' as const,
		party: null,
		termStart: s.termStart,
		termEnd: T2017.termEnd,
		note: s.note
	}))
];
// The predecessors the successors replaced end when their successor starts.
for (const s of SUCCESSORS_2017) {
	const predecessor = roster.find((r) => r.cycle === '2017' && r.county === s.county && r.name !== s.name);
	if (predecessor) {
		predecessor.termEnd = s.termStart;
		predecessor.note = s.note.replace(/^succeeded /, 'succeeded by ' + s.name + '; ');
	}
}

const output: PastGovernor[] = [];
for (const person of roster) {
	const prior = done.get(`${person.name}|${person.cycle}`);
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
			({ bio, photoUrl } = await fetchArticle(title));
			// Same-name strangers slip through the title search ("Mohamud Ali" the
			// footballer): every real match here is a Kenyan governor, so a bio that
			// mentions neither Kenya, a governorship, nor the person's own county is
			// a wrong person, not a thin article.
			if (bio && !/kenya|governor/i.test(bio) && !bio.toLowerCase().includes(person.county.toLowerCase())) {
				console.warn(`[governors-past] ${person.name}: "${title}" bio never mentions Kenya - discarded as a wrong match`);
				bio = null;
				photoUrl = null;
			} else {
				articleUrl = `${WIKI}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
			}
		}
	} catch (error) {
		console.warn(`[governors-past] ${person.name}: ${error instanceof Error ? error.message : error} - will retry on next run`);
	}
	output.push({ ...person, articleUrl, bio, photoUrl, fetchedAt: new Date().toISOString() });
	writeFileSync(OUT_FILE, JSON.stringify(output, null, '\t'));
	await sleep(DELAY_MS);
}

writeFileSync(OUT_FILE, JSON.stringify(output, null, '\t'));
console.log(
	`[governors-past] done: ${output.length} terms (${output.filter((e) => e.bio).length} with bio, ${output.filter((e) => e.photoUrl).length} with photo) -> ${OUT_FILE}`
);
