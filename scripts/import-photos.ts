// One-time LOCAL photo pipeline for scraped leader profiles. Production never
// downloads anything: processed images are git-tracked under static/leaders/ and
// arrive with the deploy; only leaders.photoUrl (set here) points at them.
//
// Per current leader with no photoUrl:
//   1. Find their photo source: mzalendo.com 13th-parliament render (MPs, Woman
//      Reps), else Wikipedia article thumbnail (Senators + fallback).
//   2. Download the ORIGINAL to .uploads/leader-photos/<slug>.<ext> (gitignored)
//      for later manual fixes.
//   3. Square it WITHOUT cutting the face — top-anchored width x width crop (the
//      head sits in the top square of these 320x400 portraits) — resize to 320,
//      and step JPEG quality down until the file is <= ~50 KB. Write to
//      static/leaders/<slug>.jpg and set leaders.photoUrl = /leaders/<slug>.jpg.
//
// Never overwrites a non-null photoUrl (manager uploads win) and skips slugs whose
// processed file already exists, so re-runs are cheap and safe.
//
//   bun run scripts/import-photos.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import { leaders, positions, users } from '../src/lib/server/db/schema';
import { slugify } from './lib/names';

const ROOT = join(import.meta.dir, '..');
const ORIGINALS_DIR = join(ROOT, '.uploads', 'leader-photos');
const OUT_DIR = join(ROOT, 'static', 'leaders');
const TARGET_BYTES = 50 * 1024;
const SIZE = 320;
const DELAY_MS = 500;

type Mz13Entry = { name: string; constituency: string | null; county: string | null; status: string | null; photoUrl: string | null };
type WikiEntry = { name: string; seat: string; region: string; photoUrl: string | null };

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function nameTokens(name: string): string[] {
	return name.toLowerCase().replace(/[^a-z\s'-]/g, ' ').split(/\s+/).filter((t) => t.length > 2);
}

function tokenOverlap(a: string, b: string): number {
	const bTokens = new Set(nameTokens(b));
	return nameTokens(a).filter((t) => bTokens.has(t)).length;
}

/** Top-anchored square -> 320px -> JPEG stepped down to <= ~50 KB. */
async function processPhoto(original: Buffer): Promise<Buffer> {
	const meta = await sharp(original).metadata();
	const side = Math.min(meta.width ?? SIZE, meta.height ?? SIZE);
	const squared = sharp(original)
		.extract({ left: Math.floor(((meta.width ?? side) - side) / 2), top: 0, width: side, height: side })
		.resize(SIZE, SIZE);
	for (let quality = 82; quality >= 40; quality -= 7) {
		const out = await squared.jpeg({ quality, mozjpeg: true }).toBuffer();
		if (out.length <= TARGET_BYTES) return out;
	}
	// Still over budget at quality 40 — shrink instead of degrading further.
	return sharp(await squared.toBuffer()).resize(256, 256).jpeg({ quality: 60, mozjpeg: true }).toBuffer();
}

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const client = postgres(process.env.DATABASE_URL, { max: 1 });
const db = drizzle(client);

const mz13: Mz13Entry[] = JSON.parse(readFileSync(join(import.meta.dir, 'out', 'scraped-mps-13th.json'), 'utf8'));
const mzSenate13: Mz13Entry[] = JSON.parse(readFileSync(join(import.meta.dir, 'out', 'scraped-mps-senate-13th.json'), 'utf8'));
const wiki: WikiEntry[] = JSON.parse(readFileSync(join(import.meta.dir, 'out', 'scraped-wikipedia-13th.json'), 'utf8'));
const executive: { name: string; seat: string; region: string; status: string; photoUrl: string | null }[] = JSON.parse(
	readFileSync(join(import.meta.dir, 'out', 'scraped-wikipedia-executive.json'), 'utf8')
);
// Dossier photos (any parliament's render) as the last resort, matched by platform slug —
// several governors are ex-MPs whose only photo is their old member page.
const dossierPhotoBySlug = new Map<string, { name: string; photoUrl: string }>();
for (const d of JSON.parse(readFileSync(join(import.meta.dir, 'out', 'dossiers.json'), 'utf8')).dossiers as {
	platformSlug: string | null;
	canonicalName: string;
	photos: { url: string }[];
}[]) {
	if (d.platformSlug && d.photos.length) dossierPhotoBySlug.set(d.platformSlug, { name: d.canonicalName, photoUrl: d.photos[0].url });
}

// Photo source lookup by seat: MPs/Woman Reps from mzalendo's NA renders,
// Senators from its senate renders, Wikipedia as the fallback for everyone.
const mzByConstituency = new Map(
	mz13.filter((e) => e.photoUrl && e.constituency).map((e) => [slugify(e.constituency!), e])
);
const mzWomanRepByCounty = new Map(
	mz13.filter((e) => e.photoUrl && e.county && /women/i.test(e.status ?? '')).map((e) => [slugify(e.county!), e])
);
const mzSenatorByCounty = new Map(
	mzSenate13.filter((e) => e.photoUrl && e.county && /elected/i.test(e.status ?? '')).map((e) => [slugify(e.county!), e])
);
const wikiBySeatRegion = new Map(
	wiki.filter((e) => e.photoUrl).map((e) => [`${e.seat}|${slugify(e.region)}`, e])
);
const executiveBySeatRegion = new Map(
	executive.filter((e) => e.photoUrl && e.status !== 'former').map((e) => [`${e.seat}|${slugify(e.region)}`, e])
);
// Council of Governors official portraits — county-labeled, covers every governor.
const cog: { county: string; name: string; photoUrl: string }[] = JSON.parse(
	readFileSync(join(import.meta.dir, 'out', 'scraped-cog-governors.json'), 'utf8')
);
const cogByCounty = new Map(cog.map((e) => [slugify(e.county), e]));
// Hand-curated county-government-site portraits for governors no bulk source covers
// (cog parse gaps, missing Wikipedia lead images) — matched by platform slug.
const countyPortraitBySlug = new Map(
	(JSON.parse(readFileSync(join(import.meta.dir, 'out', 'scraped-county-portraits.json'), 'utf8')) as {
		slug: string;
		name: string;
		photoUrl: string;
	}[]).map((e) => [e.slug, e])
);
const formerPresidentByName = new Map(
	executive.filter((e) => e.photoUrl && e.status === 'former').map((e) => [slugify(e.name), e])
);
// kiongozi.online civic profiles: portraits for the 2027 presidential candidates,
// matched by platform slug (the DB name is the guard, so carry it as `name`).
const kiongoziBySlug = new Map<string, { name: string; photoUrl: string }>();
for (const e of JSON.parse(readFileSync(join(import.meta.dir, 'out', 'scraped-kiongozi.json'), 'utf8')) as {
	platformSlug: string;
	kiongoziSlug: string;
	photoUrl: string | null;
}[]) {
	if (e.photoUrl) kiongoziBySlug.set(e.platformSlug, { name: e.kiongoziSlug.replace(/-/g, ' '), photoUrl: e.photoUrl });
}

const rows = await db
	.select({
		leaderId: leaders.id,
		userId: users.id,
		slug: users.slug,
		firstName: users.firstName,
		otherNames: users.otherNames,
		title: positions.title,
		region: positions.region
	})
	.from(leaders)
	.innerJoin(users, eq(leaders.userId, users.id))
	.innerJoin(positions, eq(leaders.positionId, positions.id))
	// All photo-less rows, former terms included: the name check below stops a seat's
	// CURRENT photo from landing on a different person's former term for that seat.
	.where(and(isNull(leaders.photoUrl), isNull(leaders.deletedAt)));

mkdirSync(ORIGINALS_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

let imported = 0;
let noSource = 0;
let nameMismatch = 0;
let failed = 0;

for (const row of rows) {
	if (!row.slug) continue;
	const regionSlug = slugify(row.region);
	const source =
		(row.title === 'MP' ? mzByConstituency.get(regionSlug) : undefined) ??
		(row.title === 'Woman Rep' ? mzWomanRepByCounty.get(regionSlug) : undefined) ??
		(row.title === 'Senator' ? mzSenatorByCounty.get(regionSlug) : undefined) ??
		// Person-name lookups outrank the seat lookup: a former president's seat key
		// points at the CURRENT holder's photo, which the name guard would reject.
		formerPresidentByName.get(slugify(`${row.firstName} ${row.otherNames}`)) ??
		countyPortraitBySlug.get(row.slug) ??
		kiongoziBySlug.get(row.slug) ??
		(row.title === 'Governor' ? cogByCounty.get(regionSlug) : undefined) ??
		executiveBySeatRegion.get(`${row.title}|${regionSlug}`) ??
		dossierPhotoBySlug.get(row.slug);
	if (!source?.photoUrl) {
		noSource++;
		continue;
	}
	// The seat matches; make sure the person does too (stale sources after by-elections).
	if (tokenOverlap(`${row.firstName} ${row.otherNames}`, source.name) === 0) {
		console.warn(`[photos] ${row.title} ${row.region}: DB has "${row.firstName} ${row.otherNames}" but source photo is "${source.name}" — skipped`);
		nameMismatch++;
		continue;
	}

	const outFile = join(OUT_DIR, `${row.slug}.jpg`);
	try {
		if (!existsSync(outFile)) {
			const res = await fetch(source.photoUrl, { headers: { 'User-Agent': 'leaders.ke photo importer (techytimo@gmail.com)' } });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const original = Buffer.from(await res.arrayBuffer());
			const ext = source.photoUrl.split('.').pop()?.toLowerCase().slice(0, 4) || 'jpg';
			writeFileSync(join(ORIGINALS_DIR, `${row.slug}.${ext}`), original);
			writeFileSync(outFile, await processPhoto(original));
			await sleep(DELAY_MS);
		}
		await db.update(leaders).set({ photoUrl: `/leaders/${row.slug}.jpg` }).where(eq(leaders.id, row.leaderId));
		imported++;
	} catch (error) {
		console.warn(`[photos] ${row.slug}: ${error instanceof Error ? error.message : error} — will retry on next run`);
		failed++;
	}
	if (imported % 25 === 0 && imported > 0) console.log(`[photos] ${imported} imported so far`);
}

console.log(
	`[photos] done: ${imported} imported, ${noSource} without a photo source, ${nameMismatch} name mismatches, ${failed} failed (re-run to retry)`
);
await client.end();
