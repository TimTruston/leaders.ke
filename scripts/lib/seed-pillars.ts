// Seeds manifesto pillars from src/lib/data/pillars.json. Mirrors the `pillars`
// table (pillars now belong to a campaign, not a leader directly). Add rows
// shaped like PillarRow below and re-run `bun run db:seed -- --pillars`.
import { and, eq, isNull } from 'drizzle-orm';
import { campaigns, pillars } from '../../src/lib/server/db/schema';
import { findLeader } from './people';
import type { AnyDb } from './names';
import pillarsData from '../../src/lib/data/pillars.json';

// Mirrors $lib/server/leader's ACTIVE_CYCLE — that module imports $env/dynamic/private
// (via $lib/server/db), which breaks under a plain `bun run` outside SvelteKit (same
// reason names.ts keeps its own slugify instead of importing the app's).
const ACTIVE_CYCLE = 2027;

type PillarRow = {
	leaderName: string;
	leaderTitle: string;
	leaderRegion: string;
	title: string;
	summary: string;
	deliveryStatus?: 'promised' | 'in_progress' | 'delivered';
	evidence?: string;
};

export async function seedPillars(db: AnyDb) {
	const rows = pillarsData as PillarRow[];
	if (rows.length === 0) {
		console.log('[pillars] no rows in pillars.json, skipping');
		return;
	}

	let seeded = 0;
	let skipped = 0;
	let missingCampaign = 0;

	for (const row of rows) {
		const leader = await findLeader(db, row.leaderName, row.leaderTitle, row.leaderRegion);
		if (!leader) {
			console.warn(`no leader found for ${row.leaderName} (${row.leaderTitle}, ${row.leaderRegion}), skipping pillar`);
			missingCampaign++;
			continue;
		}
		// A graduated/re-election campaign (leaderId set) takes priority; otherwise
		// fall back to this person's active-cycle run (leaderId null — a held
		// officeholder pursuing a DIFFERENT seat, e.g. president, this cycle, same
		// lookup $lib/server/leader's publicLead uses to pick which campaign's
		// pillars the public profile page actually reads).
		let [campaign] = await db
			.select({ id: campaigns.id })
			.from(campaigns)
			.where(and(eq(campaigns.leaderId, leader.id), isNull(campaigns.parentCampaignId), isNull(campaigns.deletedAt)));
		if (!campaign) {
			[campaign] = await db
				.select({ id: campaigns.id })
				.from(campaigns)
				.where(and(eq(campaigns.subjectUserId, leader.userId), eq(campaigns.cycleYear, ACTIVE_CYCLE), isNull(campaigns.parentCampaignId), isNull(campaigns.deletedAt)));
		}
		if (!campaign) {
			console.warn(`no campaign found for ${row.leaderName} (run the campaigns phase first), skipping pillar`);
			missingCampaign++;
			continue;
		}

		const [existing] = await db
			.select({ id: pillars.id })
			.from(pillars)
			.where(and(eq(pillars.campaignId, campaign.id), eq(pillars.title, row.title), isNull(pillars.deletedAt)));
		if (existing) {
			skipped++;
			continue;
		}

		await db.insert(pillars).values({
			campaignId: campaign.id,
			title: row.title,
			summary: row.summary,
			deliveryStatus: row.deliveryStatus ?? 'promised',
			evidence: row.evidence ?? null
		});
		seeded++;
	}

	console.log(`[pillars] seeded ${seeded}, skipped ${skipped} already-seeded, ${missingCampaign} missing a campaign`);
}
