// Seeds manifesto pillars from src/lib/data/pillars.json. Mirrors the `pillars`
// table (pillars now belong to a campaign, not a leader directly). Stub file —
// empty until real pillar content is supplied; add rows shaped like PillarRow
// below and re-run `bun run db:seed -- --pillars`.
import { and, eq, isNull } from 'drizzle-orm';
import { campaigns, pillars } from '../../src/lib/server/db/schema';
import { findLeader } from './people';
import type { AnyDb } from './names';
import pillarsData from '../../src/lib/data/pillars.json';

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
		const [campaign] = await db
			.select({ id: campaigns.id })
			.from(campaigns)
			.where(and(eq(campaigns.leaderId, leader.id), isNull(campaigns.parentCampaignId), isNull(campaigns.deletedAt)));
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
