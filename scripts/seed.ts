// Single seeding entry point. Each phase mirrors one data file to one DB table
// (or table pair), named to match: src/lib/data/<name>.json -> --<name>.
// No flags wipes every seed-managed table (users/auth accounts survive — see
// ./lib/reset.ts) and reseeds every phase from scratch, in dependency order:
//   bun run db:seed
// Passing specific phases skips the reset and just runs those, idempotently
// (existing rows are left alone/backfilled, nothing is dropped):
//   bun run db:seed -- --parties --leaders
//   bun run db:seed -- --pillars
//
// Dependency order: positions -> parties -> leaders -> mcas -> campaigns -> pillars -> issues -> news
// (leaders/mcas look up parties by title and seed each person's `leadership[]` terms
// as extra `leaders` rows in the same pass; campaigns/pillars look up leaders; issues
// only needs positions. pillar-templates has no dependency, runs any time.)
import { parseArgs } from 'node:util';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { resetSeedData } from './lib/reset';
import { seedPositions } from './lib/seed-positions';
import { seedParties } from './lib/seed-parties';
import { seedLeaders } from './lib/seed-leaders';
import { seedMcas } from './lib/seed-mcas';
import { seedCampaigns } from './lib/seed-campaigns';
import { seedPillars } from './lib/seed-pillars';
import { seedPillarTemplates } from './lib/seed-pillar-templates';
import { seedIssues } from './lib/seed-issues';
import { seedNews } from './lib/seed-news';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const client = postgres(process.env.DATABASE_URL, { max: 1 });
const db = drizzle(client);

const { values } = parseArgs({
	options: {
		positions: { type: 'boolean', default: false },
		parties: { type: 'boolean', default: false },
		leaders: { type: 'boolean', default: false },
		mcas: { type: 'boolean', default: false },
		campaigns: { type: 'boolean', default: false },
		pillars: { type: 'boolean', default: false },
		'pillar-templates': { type: 'boolean', default: false },
		issues: { type: 'boolean', default: false },
		news: { type: 'boolean', default: false }
	},
	strict: true
});

// No flags at all -> full clean reseed: wipe every seed-managed table (users/auth
// accounts survive), then run every phase in dependency order.
const runAll = !Object.values(values).some(Boolean);

if (runAll) await resetSeedData(db);

if (runAll || values.positions) await seedPositions(db);
if (runAll || values.parties) await seedParties(db);
if (runAll || values.leaders) await seedLeaders(db);
if (runAll || values.mcas) await seedMcas(db);
if (runAll || values.campaigns) await seedCampaigns(db);
if (runAll || values.pillars) await seedPillars(db);
if (runAll || values['pillar-templates']) await seedPillarTemplates(db);
if (runAll || values.issues) await seedIssues(db);
if (runAll || values.news) await seedNews(db);

await client.end();
