// Admin "Candidates" tab: the full roster in one table — held terms (current/former
// leaders rows) plus the verified 2027 runs (campaigns) that haven't graduated yet.
// A run can be graduated here: recording a win turns it into a `current` leaders row.
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, leaders, positions, users } from '$lib/server/db/schema';
import { ACTIVE_CYCLE, fullName, leaderPath } from '$lib/server/leader';

// Kenyan general-election winners are sworn in the week after the August vote.
const SWEAR_IN = new Date('2027-08-31T00:00:00+03:00');

export type CandidateRow = {
	key: string; // 'term:<id>' | 'run:<id>' — stable table key
	campaignId: number | null; // set for a run (graduatable), null for a held term
	name: string;
	path: string;
	positionTitle: string;
	region: string;
	status: string; // 'current' | 'former' | 'aspirant'
	verified: boolean;
	createdAt: Date;
};

export type CandidatePage = { candidates: CandidateRow[]; total: number };

export async function listCandidates(page: number, pageSize: number): Promise<CandidatePage> {
	// Held terms and verified un-graduated runs, fetched in full then merged/paginated
	// in JS (admin-only, a few thousand rows) so the two sources share one ordered table.
	const [termRows, runRows] = await Promise.all([
		db
			.select()
			.from(leaders)
			.innerJoin(users, eq(leaders.userId, users.id))
			.innerJoin(positions, eq(leaders.positionId, positions.id))
			.where(isNull(leaders.deletedAt)),
		db
			.select({ campaigns, users, positions })
			.from(campaigns)
			.innerJoin(users, eq(campaigns.subjectUserId, users.id))
			.innerJoin(positions, eq(campaigns.positionId, positions.id))
			.where(
				and(
					eq(campaigns.cycleYear, ACTIVE_CYCLE),
					isNull(campaigns.parentCampaignId),
					isNotNull(campaigns.verifiedAt),
					isNull(campaigns.leaderId), // not yet graduated (a graduated run points at its term)
					isNull(campaigns.deletedAt)
				)
			)
	]);

	const all: CandidateRow[] = [
		...termRows.map((r) => ({
			key: `term:${r.leaders.id}`,
			campaignId: null,
			name: fullName(r.users),
			path: leaderPath(r.users),
			positionTitle: r.positions.title,
			region: r.positions.region,
			status: r.leaders.status,
			verified: !!r.leaders.verifiedAt,
			createdAt: r.leaders.createdAt
		})),
		...runRows.map((r) => ({
			key: `run:${r.campaigns.id}`,
			campaignId: r.campaigns.id,
			name: fullName(r.users),
			path: leaderPath(r.users),
			positionTitle: r.positions.title,
			region: r.positions.region,
			status: 'aspirant',
			verified: !!r.campaigns.verifiedAt,
			createdAt: r.campaigns.createdAt
		}))
	].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

	return {
		total: all.length,
		candidates: all.slice((page - 1) * pageSize, page * pageSize)
	};
}

/**
 * Record a win: graduate a run (campaign) into a `current` leaders row. Retires the
 * seat's sitting holder (one_current_per_position), creates the winner's new current
 * term (startAt = swearing-in), and links the run to it so its manifesto becomes the
 * term's delivery tracker. The run stays as the historical record of how they won.
 */
export async function graduateCampaign(campaignId: number): Promise<{ leaderId: number } | null> {
	const [c] = await db
		.select({ id: campaigns.id, subjectUserId: campaigns.subjectUserId, positionId: campaigns.positionId, leaderId: campaigns.leaderId })
		.from(campaigns)
		.where(and(eq(campaigns.id, campaignId), isNotNull(campaigns.verifiedAt), isNull(campaigns.deletedAt)));
	if (!c || c.leaderId) return null; // gone, unverified, or already graduated

	return await db.transaction(async (tx) => {
		// Retire the seat's current holder, if any (keeps one_current_per_position).
		await tx
			.update(leaders)
			.set({ status: 'former', endAt: SWEAR_IN })
			.where(and(eq(leaders.positionId, c.positionId), eq(leaders.status, 'current'), isNull(leaders.deletedAt)));

		const [newLeader] = await tx
			.insert(leaders)
			.values({ userId: c.subjectUserId, positionId: c.positionId, status: 'current', startAt: SWEAR_IN, verifiedAt: new Date() })
			.returning({ id: leaders.id });

		// Link the winning run to its new term (its pillars carry over as the delivery tracker).
		await tx.update(campaigns).set({ leaderId: newLeader.id }).where(eq(campaigns.id, campaignId));
		return { leaderId: newLeader.id };
	});
}
