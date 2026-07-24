// Single seeding entry point. Each phase mirrors one data file to one DB table
// (or table pair), named to match: src/lib/data/<name>.json -> --<name>. No flags
// wipes every seed-managed table AND every account, dev logins included (see
// ./lib/reset.ts), and reseeds EVERYTHING from scratch, in dependency order —
// the curated demo dataset AND the real scraped register (the `scraped` phase,
// see seedScrapedPipeline below):
//   bun run db:seed
// Passing specific phases skips the reset and just runs those, idempotently
// (existing rows are left alone/backfilled, nothing is dropped):
//   bun run db:seed -- --parties --leaders
//   bun run db:seed -- --pillars
// --clear forces the wipe even alongside specific phases (e.g. wipe everything but
// only reseed leaders). It's a TRUNCATE ... RESTART IDENTITY, so serial ids restart
// at 1 same as a drop+recreate would, without having to re-run migrations after:
//   bun run db:seed -- --clear --leaders
//
// Dependency order: system-user -> positions -> parties -> leaders -> mcas -> photos
// -> scraped -> campaigns -> pillars -> issues -> news -> admin-fixture -> notable-knowledge
// -> demo-logins (admin-fixture needs system-user + positions: it turns the ADMIN_EMAIL
// account into a dev-only demo leader, visible only to a signed-in admin since it stays
// unverified). (leaders/mcas look up parties by title and seed each person's
// `leadership[]` terms as extra `leaders` rows in the same pass; photos matches shipped
// static/leaders/<slug>.jpg files against every seeded slug; scraped layers the REAL
// register (thousands of MPs/history from scripts/out/*.json) on top — see
// seedScrapedPipeline below; campaigns/pillars look up leaders; issues only needs
// positions and the system user as creatorId; notable-knowledge (Knowledge tab FAQ +
// documents, see scripts/data/notable-knowledge.ts) and demo-logins (grants a real,
// loginable account to specific notable already-seeded profiles, sharing ADMIN_PASSWORD)
// both look up their target people by slug, so they run last. system-user runs first,
// unconditionally, so on a fresh DB its id is the lowest/first user id — it's also the
// ADMIN_EMAIL/PASSWORD account. pillar-templates and platform-settings have no
// dependency, run any time.)
//
// `scraped` runs the full scraped-roster pipeline (scripts/seed-scraped.ts and the
// five scripts after it — see seedScrapedPipeline) as child processes, same chain as
// the old `db:seed:scraped` package.json script. It's part of the default full run
// (and therefore of `--clear`) so a clean reseed never silently leaves the DB on just
// the small curated demo dataset (src/lib/data/leaders.json) — every officeholder in
// the real register (e.g. a sitting MP not in that curated file) comes back too.
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { resetSeedData } from './lib/reset';
import { getOrCreateSystemUser } from './lib/people';
import { seedPositions } from './lib/seed-positions';
import { seedParties } from './lib/seed-parties';
import { seedLeaders } from './lib/seed-leaders';
import { seedMcas } from './lib/seed-mcas';
import { seedPhotos } from './lib/seed-photos';
import { seedCampaigns } from './lib/seed-campaigns';
import { seedPillars } from './lib/seed-pillars';
import { seedPillarTemplates } from './lib/seed-pillar-templates';
import { seedIssues } from './lib/seed-issues';
import { seedNews } from './lib/seed-news';
import { seedPlatformSettings } from './lib/seed-platform-settings';
import { seedPackages } from './lib/seed-packages';
import { seedAdminFixture } from './lib/seed-admin-fixture';
import { seedNotableKnowledge } from './lib/seed-notable-knowledge';
import { seedDemoLogins } from './lib/seed-demo-logins';

// Runs one scraped-pipeline script as a child process (each owns its own DB
// connection/CLI flags — `--apply`, dry-run analysis, etc. — so this shells out
// rather than reimplementing them as importable phase functions). Inherits
// stdio so their own progress/warning output still streams live; a non-zero
// exit aborts the whole seed run, matching how the phases above throw on error.
async function runStep(scriptRelPath: string, args: string[] = []): Promise<void> {
	const scriptPath = new URL(scriptRelPath, import.meta.url).pathname;
	console.log(`\n[scraped] bun run ${scriptRelPath} ${args.join(' ')}`.trimEnd());
	const proc = Bun.spawn({ cmd: ['bun', 'run', scriptPath, ...args], stdout: 'inherit', stderr: 'inherit', stdin: 'inherit' });
	const code = await proc.exited;
	if (code !== 0) throw new Error(`${scriptRelPath} exited with code ${code}`);
}

// The real scraped register, layered on top of the curated demo dataset: current
// 13th-Parliament roster, by-elections, former MPs, executive (presidents/governors),
// former governors, photo URLs for anyone newly seeded, then AI-enriched extras.
// Mirrors the old `db:seed:scraped` package.json chain exactly.
async function seedScrapedPipeline(): Promise<void> {
	await runStep('./seed-scraped.ts', ['--apply']);
	await runStep('./seed-by-elections.ts', ['--apply']);
	await runStep('./seed-former-mps.ts', ['--apply']);
	await runStep('./seed-executive.ts', ['--apply']);
	await runStep('./seed-former-governors.ts', ['--apply']);
	await runStep('./seed-photos.ts');
	await runStep('./seed-agentic.ts', ['--apply']);
}

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const client = postgres(process.env.DATABASE_URL, { max: 1 });
const db = drizzle(client);

const { values } = parseArgs({
	options: {
		clear: { type: 'boolean', default: false },
		yes: { type: 'boolean', default: false, short: 'y' },
		'system-user': { type: 'boolean', default: false },
		positions: { type: 'boolean', default: false },
		parties: { type: 'boolean', default: false },
		leaders: { type: 'boolean', default: false },
		mcas: { type: 'boolean', default: false },
		photos: { type: 'boolean', default: false },
		scraped: { type: 'boolean', default: false },
		campaigns: { type: 'boolean', default: false },
		pillars: { type: 'boolean', default: false },
		'pillar-templates': { type: 'boolean', default: false },
		issues: { type: 'boolean', default: false },
		news: { type: 'boolean', default: false },
		'platform-settings': { type: 'boolean', default: false },
		packages: { type: 'boolean', default: false },
		'admin-fixture': { type: 'boolean', default: false },
		'notable-knowledge': { type: 'boolean', default: false },
		'demo-logins': { type: 'boolean', default: false }
	},
	strict: true
});

// No phase flags at all -> full clean reseed: run every phase in dependency order.
// `clear`/`yes` don't count as phase flags, so `--clear` alone still means "wipe +
// reseed everything" (same as no args), while `--clear --leaders` means "wipe, then
// reseed only leaders" — clear is a modifier on top of whichever phases were requested.
const { clear, yes, ...phaseFlags } = values;
const runAll = !Object.values(phaseFlags).some(Boolean);
const willWipe = clear || runAll;

if (willWipe && !yes) {
	console.log(`\nThis will permanently wipe ${new URL(process.env.DATABASE_URL).pathname.slice(1)}:`);
	console.log('  - every seed-managed table (positions, leaders, campaigns, pillars, reviews, ...)');
	console.log('  - every account, including your own dev login and any manual signups');
	console.log('The system/dev-admin account (ADMIN_EMAIL) is recreated fresh afterward — everything else is gone for good.\n');

	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const answer = await rl.question('Type "yes" to continue: ');
	rl.close();
	if (answer.trim().toLowerCase() !== 'yes') {
		console.log('Aborted, nothing was touched.');
		await client.end();
		process.exit(1);
	}
}

if (willWipe) await resetSeedData(db);

if (runAll || values['platform-settings']) await seedPlatformSettings(db);
if (runAll || values.packages) await seedPackages(db);
if (runAll || values['system-user']) await getOrCreateSystemUser(db);
if (runAll || values.positions) await seedPositions(db);
if (runAll || values.parties) await seedParties(db);
if (runAll || values.leaders) await seedLeaders(db);
if (runAll || values.mcas) await seedMcas(db);
// After leaders/mcas so every seeded person's slug exists to match a shipped photo.
if (runAll || values.photos) await seedPhotos(db);
// Layers the real scraped register on top of the curated demo dataset — part of
// the default full run (and --clear) so a clean reseed never leaves the DB on
// just the small demo file. Runs as child processes (own DB connections), so the
// long-lived client/db above sits idle meanwhile; that's fine, nothing here uses it.
if (runAll || values.scraped) await seedScrapedPipeline();
if (runAll || values.campaigns) await seedCampaigns(db);
if (runAll || values.pillars) await seedPillars(db);
if (runAll || values['pillar-templates']) await seedPillarTemplates(db);
if (runAll || values.issues) await seedIssues(db);
if (runAll || values.news) await seedNews(db);
if (runAll || values['admin-fixture']) await seedAdminFixture(db);
// Depends on leaders/scraped/campaigns already having seeded these specific
// profiles (looked up by slug) — runs last for that reason.
if (runAll || values['notable-knowledge']) await seedNotableKnowledge(db);
if (runAll || values['demo-logins']) await seedDemoLogins(db);

await client.end();
