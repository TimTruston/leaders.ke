import { and, count, desc, eq, isNull, ne } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, followers, leaders, pillars, positions, posts, tags, users } from '$lib/server/db/schema';
import { requireLeader } from '$lib/server/dashboard';
import { fullName, leaderPath } from '$lib/server/leader';
import type { PageServerLoad } from './$types';

// Competitor watch: everyone else vying for (or holding) the same seat, with
// the public signals that matter — followers, output, coverage.
export const load: PageServerLoad = async (event) => {
	const { ctx } = await requireLeader(event);

	const rivalRows = await db
		.select()
		.from(leaders)
		.innerJoin(positions, eq(leaders.positionId, positions.id))
		.innerJoin(users, eq(leaders.userId, users.id))
		.where(
			and(
				eq(leaders.positionId, ctx.leader.positionId),
				ne(leaders.id, ctx.leader.id),
				isNull(leaders.deletedAt)
			)
		);

	const statsFor = async (leaderId: number) => {
		const [[followerRow], [postRow], [pillarRow], [mentionRow], latest] = await Promise.all([
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
				.select({ n: count() })
				.from(pillars)
				.innerJoin(campaigns, eq(pillars.campaignId, campaigns.id))
				.where(and(eq(campaigns.leaderId, leaderId), isNull(pillars.deletedAt))),
			db
				.select({ n: count() })
				.from(tags)
				.where(and(eq(tags.leaderId, leaderId), isNull(tags.deletedAt))),
			db
				.select({ title: posts.title, createdAt: posts.createdAt })
				.from(posts)
				.where(
					and(
						eq(posts.leaderId, leaderId),
						eq(posts.medium, 'web'),
						eq(posts.public, true),
						isNull(posts.deletedAt)
					)
				)
				.orderBy(desc(posts.createdAt))
				.limit(1)
		]);
		return {
			followers: followerRow.n,
			postCount: postRow.n,
			pillarCount: pillarRow.n,
			mentionCount: mentionRow.n,
			latestPost: latest[0]
				? { title: latest[0].title, createdAt: latest[0].createdAt.toISOString() }
				: null
		};
	};

	const dbRivals = await Promise.all(
		rivalRows.map(async (r) => ({
			name: fullName(r.users),
			path: leaderPath(r.users),
			party: null as string | null,
			status: r.leaders.status,
			verified: !!r.leaders.verifiedAt,
			...(await statsFor(r.leaders.id))
		}))
	);

	const mine = await statsFor(ctx.leader.id);

	return {
		seat: `${ctx.position.title}, ${ctx.position.region}`,
		mine,
		rivals: dbRivals.sort((a, b) => b.followers - a.followers)
	};
};
