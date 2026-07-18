// Single seeding entry point. Each phase mirrors one data file to one DB table
// (or table pair), named to match: src/lib/data/<name>.json -> --<name>.
// No flags wipes every seed-managed table AND every account, dev logins included
// (see ./lib/reset.ts), and reseeds every phase from scratch, in dependency order:
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
// Dependency order: system-user -> positions -> parties -> leaders -> mcas -> campaigns
// -> pillars -> issues -> news -> admin-fixture (admin-fixture needs system-user +
// positions: it turns the ADMIN_EMAIL account into a dev-only demo leader, visible only
// to a signed-in admin since it stays unverified). (leaders/mcas look up parties by title and seed each
// person's `leadership[]` terms as extra `leaders` rows in the same pass;
// campaigns/pillars look up leaders; issues only needs positions and the system user
// as creatorId. system-user runs first, unconditionally, so on a fresh DB its id is
// the lowest/first user id — it's also the ADMIN_EMAIL/PASSWORD account. pillar-templates
// and platform-settings have no dependency, run any time.)
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
import { seedCampaigns } from './lib/seed-campaigns';
import { seedPillars } from './lib/seed-pillars';
import { seedPillarTemplates } from './lib/seed-pillar-templates';
import { seedIssues } from './lib/seed-issues';
import { seedNews } from './lib/seed-news';
import { seedPlatformSettings } from './lib/seed-platform-settings';
import { seedPackages } from './lib/seed-packages';
import { seedAdminFixture } from './lib/seed-admin-fixture';

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
		campaigns: { type: 'boolean', default: false },
		pillars: { type: 'boolean', default: false },
		'pillar-templates': { type: 'boolean', default: false },
		issues: { type: 'boolean', default: false },
		news: { type: 'boolean', default: false },
		'platform-settings': { type: 'boolean', default: false },
		packages: { type: 'boolean', default: false },
		'admin-fixture': { type: 'boolean', default: false }
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
if (runAll || values.campaigns) await seedCampaigns(db);
if (runAll || values.pillars) await seedPillars(db);
if (runAll || values['pillar-templates']) await seedPillarTemplates(db);
if (runAll || values.issues) await seedIssues(db);
if (runAll || values.news) await seedNews(db);
if (runAll || values['admin-fixture']) await seedAdminFixture(db);

await client.end();
