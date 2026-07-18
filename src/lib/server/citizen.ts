// Citizen-side dashboard content: leaders they follow, a feed from those leaders,
// and their pledged votes. All keyed off followers.userId / pledges.userId, which
// are only populated for signed-in actions (anonymous follows/pledges have none).
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, followers, leaders, pledges, positions, posts, users } from '$lib/server/db/schema';
import { fullName, leaderPath } from '$lib/server/leader';

export type FollowedLeader = {
	leaderId: number;
	name: string;
	path: string;
	positionTitle: string;
	region: string;
};

export async function listFollowedLeaders(userId: number): Promise<FollowedLeader[]> {
	// Follows are person-scoped (digestId = the followed person's users.id); the seat
	// shown is their active term (latest start), picked in JS from the joined terms.
	const rows = await db
		.select()
		.from(followers)
		.innerJoin(users, eq(followers.digestId, users.id))
		.innerJoin(leaders, eq(leaders.userId, users.id))
		.innerJoin(positions, eq(leaders.positionId, positions.id))
		.where(and(eq(followers.userId, userId), eq(followers.digest, 'leader'), isNull(followers.deletedAt), isNull(leaders.deletedAt)));

	const byPerson = new Map<number, (typeof rows)[number]>();
	for (const r of rows) {
		const prev = byPerson.get(r.users.id);
		if (!prev || r.leaders.startAt.getTime() > prev.leaders.startAt.getTime()) byPerson.set(r.users.id, r);
	}
	return [...byPerson.values()].map((r) => ({
		leaderId: r.leaders.id,
		name: fullName(r.users),
		path: leaderPath(r.users),
		positionTitle: r.positions.title,
		region: r.positions.region
	}));
}

export type FeedPost = {
	id: number;
	title: string;
	body: string;
	createdAt: string;
	leaderName: string;
	leaderPath: string;
};

/** Recent public posts from the leaders this citizen follows, newest first. */
export async function listFollowedLeadersFeed(userId: number, limit = 20): Promise<FeedPost[]> {
	const followed = await db
		.select({ personId: followers.digestId })
		.from(followers)
		.where(and(eq(followers.userId, userId), eq(followers.digest, 'leader'), isNull(followers.deletedAt)));
	const personIds = followed.map((f) => f.personId).filter((id): id is number => id != null);
	if (personIds.length === 0) return [];

	const rows = await db
		.select({
			id: posts.id,
			title: posts.title,
			body: posts.body,
			createdAt: posts.createdAt,
			firstName: users.firstName,
			otherNames: users.otherNames,
			slug: users.slug
		})
		.from(posts)
		.innerJoin(users, eq(posts.subjectUserId, users.id))
		.where(
			and(
				inArray(posts.subjectUserId, personIds),
				eq(posts.medium, 'web'),
				eq(posts.public, true),
				isNull(posts.deletedAt)
			)
		)
		.orderBy(desc(posts.createdAt))
		.limit(limit);

	return rows.map((r) => ({
		id: r.id,
		title: r.title,
		body: r.body,
		createdAt: r.createdAt.toISOString(),
		leaderName: fullName({ firstName: r.firstName, otherNames: r.otherNames }),
		leaderPath: leaderPath({ slug: r.slug })
	}));
}

export type MyPledge = {
	leaderName: string;
	path: string;
	positionTitle: string;
	region: string;
	pledgedAt: string;
};

export async function listMyPledges(userId: number): Promise<MyPledge[]> {
	const rows = await db
		.select()
		.from(pledges)
		.innerJoin(campaigns, eq(pledges.campaignId, campaigns.id))
		.innerJoin(leaders, eq(campaigns.leaderId, leaders.id))
		.innerJoin(users, eq(leaders.userId, users.id))
		.innerJoin(positions, eq(leaders.positionId, positions.id))
		.where(and(eq(pledges.userId, userId), isNull(pledges.deletedAt)));

	return rows.map((r) => ({
		leaderName: fullName(r.users),
		path: leaderPath(r.users),
		positionTitle: r.positions.title,
		region: r.positions.region,
		pledgedAt: r.pledges.createdAt.toISOString()
	}));
}
