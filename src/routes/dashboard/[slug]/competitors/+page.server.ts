import { and, count, desc, eq, isNotNull, isNull, ne } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { ACTIVE_CYCLE, fullName, leaderPath } from '$lib/server/leader';
import { campaigns, followers, leaders, pillars, posts, tags, users } from '$lib/server/db/schema';
import { requireLeader } from '$lib/server/dashboard';
import type { PageServerLoad } from './$types';

// Competitor watch: everyone else vying for (or holding) the same seat, with
// the public signals that matter — followers, output, coverage.
export const load: PageServerLoad = async (event) => {
	const { ctx } = await requireLeader(event);
	const seatId = ctx.leader.positionId;

	// Rivals at this seat: other held terms, plus other verified 2027 runs (aspirants).
	const [heldRivals, runRivals] = await Promise.all([
		db
			.select({ userId: users.id, users, status: leaders.status, verified: leaders.verifiedAt })
			.from(leaders)
			.innerJoin(users, eq(leaders.userId, users.id))
			.where(and(eq(leaders.positionId, seatId), ne(leaders.userId, ctx.profileUser.id), isNull(leaders.deletedAt))),
		db
			.select({ userId: users.id, users, verified: campaigns.verifiedAt })
			.from(campaigns)
			.innerJoin(users, eq(campaigns.subjectUserId, users.id))
			.where(
				and(
					eq(campaigns.positionId, seatId),
					eq(campaigns.cycleYear, ACTIVE_CYCLE),
					isNull(campaigns.parentCampaignId),
					isNotNull(campaigns.verifiedAt),
					isNull(campaigns.deletedAt),
					ne(campaigns.subjectUserId, ctx.profileUser.id)
				)
			)
	]);
	// One rival per person; a held term wins the status label over a run.
	const rivalByPerson = new Map<number, { users: typeof users.$inferSelect; status: string; verified: boolean }>();
	for (const r of runRivals) rivalByPerson.set(r.userId, { users: r.users, status: 'aspirant', verified: !!r.verified });
	for (const r of heldRivals) rivalByPerson.set(r.userId, { users: r.users, status: r.status, verified: !!r.verified });

	const statsFor = async (personId: number) => {
		const [[followerRow], [postRow], [pillarRow], [mentionRow], latest] = await Promise.all([
			db
				.select({ n: count() })
				.from(followers)
				.where(
					and(
						eq(followers.digest, 'leader'),
						eq(followers.digestId, personId),
						isNull(followers.deletedAt)
					)
				),
			db
				.select({ n: count() })
				.from(posts)
				.where(
					and(
						eq(posts.subjectUserId, personId),
						eq(posts.medium, 'web'),
						eq(posts.public, true),
						isNull(posts.deletedAt)
					)
				),
			db
				.select({ n: count() })
				.from(pillars)
				.innerJoin(campaigns, eq(pillars.campaignId, campaigns.id))
				.where(and(eq(campaigns.subjectUserId, personId), isNull(pillars.deletedAt))),
			db
				.select({ n: count() })
				.from(tags)
				.where(and(eq(tags.subjectUserId, personId), isNull(tags.deletedAt))),
			db
				.select({ title: posts.title, createdAt: posts.createdAt })
				.from(posts)
				.where(
					and(
						eq(posts.subjectUserId, personId),
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
		[...rivalByPerson.values()].map(async (r) => ({
			name: fullName(r.users),
			path: leaderPath(r.users),
			party: null as string | null,
			status: r.status,
			verified: r.verified,
			...(await statsFor(r.users.id))
		}))
	);

	const mine = await statsFor(ctx.profileUser.id);

	return {
		seat: `${ctx.position.title}, ${ctx.position.region}`,
		mine,
		rivals: dbRivals.sort((a, b) => b.followers - a.followers)
	};
};
