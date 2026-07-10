// Seeds one main campaign per incumbent/aspirant leader from src/lib/data/campaigns.json.
// Mirrors the `campaigns` table. Runs after 'leaders'/'mcas' (needs the leader to
// already exist) — each row resolves its leader by name + position title/region.
// Idempotent: skips a leader who already has a live main campaign (matches the
// DB's own one-main-campaign-per-leader constraint).
import { and, eq, isNull } from 'drizzle-orm';
import { campaigns } from '../../src/lib/server/db/schema';
import { findLeader } from './people';
import type { AnyDb } from './names';
import campaignsData from '../../src/lib/data/campaigns.json';

type CampaignRow = {
	leaderName: string;
	leaderTitle: string;
	leaderRegion: string;
	title: string;
	description: string;
};

export async function seedCampaigns(db: AnyDb) {
	let seeded = 0;
	let skipped = 0;
	let missingLeader = 0;

	for (const row of campaignsData as CampaignRow[]) {
		const leader = await findLeader(db, row.leaderName, row.leaderTitle, row.leaderRegion);
		if (!leader) {
			console.warn(`no leader found for ${row.leaderName} (${row.leaderTitle}, ${row.leaderRegion}), skipping campaign`);
			missingLeader++;
			continue;
		}

		const [existing] = await db
			.select({ id: campaigns.id })
			.from(campaigns)
			.where(and(eq(campaigns.leaderId, leader.id), isNull(campaigns.parentCampaignId), isNull(campaigns.deletedAt)));
		if (existing) {
			skipped++;
			continue;
		}

		await db.insert(campaigns).values({
			creatorId: leader.userId,
			leaderId: leader.id,
			title: row.title,
			description: row.description
		});
		seeded++;
	}

	console.log(`[campaigns] seeded ${seeded}, skipped ${skipped} already-seeded, ${missingLeader} missing a leader`);
}
