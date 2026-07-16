// Public leader metrics shared by /ranks, /compare and dashboards.
// The engagement score is deliberately transparent: citizens can recompute it.
import { and, count, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	campaigns,
	followers,
	leaders,
	pillars,
	pledges,
	positions,
	posts,
	users
} from '$lib/server/db/schema';
import { fullName, leaderPath } from '$lib/server/leader';

export type LeaderMetrics = {
	name: string;
	path: string;
	photoUrl: string | null;
	positionTitle: string;
	regionLabel: string;
	party: string | null;
	status: string;
	verified: boolean;
	followers: number;
	pledges: number;
	postCount: number;
	pillarCount: number;
	delivered: number;
	score: number;
	bio: string;
	pillars: { title: string; summary: string; deliveryStatus: string }[];
};

// score = followers + 5×pledges + 10×public posts + 100×delivered pillars
export function engagementScore(m: {
	followers: number;
	pledges: number;
	postCount: number;
	delivered: number;
}): number {
	return m.followers + 5 * m.pledges + 10 * m.postCount + 100 * m.delivered;
}

// Public metrics: only verified profiles are listed, per the same rule as /leaders and /search.
export async function listLeaderMetrics(): Promise<LeaderMetrics[]> {
	const rows = await db
		.select()
		.from(leaders)
		.innerJoin(positions, eq(leaders.positionId, positions.id))
		.innerJoin(users, eq(leaders.userId, users.id))
		.where(and(isNull(leaders.deletedAt), isNotNull(leaders.verifiedAt)));

	const dbMetrics = await Promise.all(
		rows.map(async (r) => {
			const leaderId = r.leaders.id;
			const [[followerRow], [pledgeRow], [postRow], pillarRows] = await Promise.all([
				db
					.select({ n: count() })
					.from(followers)
					.where(
						and(
							eq(followers.digest, 'leader'),
							eq(followers.digestId, leaderId),
							isNull(followers.deletedAt)
						)
					),
				// Live vote pledges across all of the leader's campaigns
				db
					.select({ n: count() })
					.from(pledges)
					.innerJoin(campaigns, eq(pledges.campaignId, campaigns.id))
					.where(and(eq(campaigns.leaderId, leaderId), isNull(pledges.deletedAt))),
				db
					.select({ n: count() })
					.from(posts)
					.where(
						and(
							eq(posts.leaderId, leaderId),
							eq(posts.medium, 'web'),
							eq(posts.public, true),
							isNull(posts.deletedAt)
						)
					),
				db
					.select({
						title: pillars.title,
						summary: pillars.summary,
						deliveryStatus: pillars.deliveryStatus
					})
					.from(pillars)
					.innerJoin(campaigns, eq(pillars.campaignId, campaigns.id))
					.where(and(eq(campaigns.leaderId, leaderId), isNull(pillars.deletedAt)))
			]);

			const delivered = pillarRows.filter((p) => p.deliveryStatus === 'delivered').length;
			const base = {
				followers: followerRow.n,
				pledges: pledgeRow.n,
				postCount: postRow.n,
				delivered
			};
			return {
				name: fullName(r.users),
				path: leaderPath(r.users),
				photoUrl: r.leaders.photoUrl,
				positionTitle: r.positions.title,
				regionLabel: r.positions.region,
				party: null,
				status: r.leaders.status,
				verified: !!r.leaders.verifiedAt,
				pillarCount: pillarRows.length,
				bio: r.users.bio ?? '',
				pillars: pillarRows,
				...base,
				score: engagementScore(base)
			} satisfies LeaderMetrics;
		})
	);

	// A person can have several `leaders` rows (Track Record) that all share one
	// flat URL; keep just one card per path, preferring their non-'former' row.
	const dbByPath = new Map<string, (typeof dbMetrics)[number]>();
	for (const m of dbMetrics) {
		const existing = dbByPath.get(m.path);
		if (!existing || (existing.status === 'former' && m.status !== 'former')) {
			dbByPath.set(m.path, m);
		}
	}
	const dedupedDbMetrics = [...dbByPath.values()];

	return dedupedDbMetrics.sort((a, b) => b.score - a.score);
}
