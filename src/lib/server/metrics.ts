// Public leader metrics shared by /rank/[position] and /compare.
// The engagement score is deliberately transparent: citizens can recompute it.
import { and, count, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	campaigns,
	followers,
	leaders,
	parties,
	partyMemberships,
	pillars,
	pledges,
	positions,
	posts,
	users
} from '$lib/server/db/schema';
import { fullName, leaderPath, resolveCurrentTerm, slugify } from '$lib/server/leader';

export type LeaderMetrics = {
	name: string;
	path: string;
	photoUrl: string | null;
	positionTitle: string;
	regionLabel: string;
	party: string | null;
	partyPath: string | null;
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

// The engagement queries (followers, pledges, posts, pillars) for one leader row,
// assembled into a LeaderMetrics. Shared by the full listing and the single-leader
// fetch so both compute the score identically. `party` is passed in so callers can
// batch it (listing) or fetch it once (single) as they prefer.
async function computeLeaderMetrics(
	leader: typeof leaders.$inferSelect,
	position: typeof positions.$inferSelect,
	user: typeof users.$inferSelect,
	party: string | null
): Promise<LeaderMetrics> {
	const leaderId = leader.id;
	const [[followerRow], [pledgeRow], [postRow], pillarRows] = await Promise.all([
		db
			.select({ n: count() })
			.from(followers)
			.where(and(eq(followers.digest, 'leader'), eq(followers.digestId, leaderId), isNull(followers.deletedAt))),
		// Live vote pledges across all of the leader's campaigns
		db
			.select({ n: count() })
			.from(pledges)
			.innerJoin(campaigns, eq(pledges.campaignId, campaigns.id))
			.where(and(eq(campaigns.leaderId, leaderId), isNull(pledges.deletedAt))),
		db
			.select({ n: count() })
			.from(posts)
			.where(and(eq(posts.leaderId, leaderId), eq(posts.medium, 'web'), eq(posts.public, true), isNull(posts.deletedAt))),
		db
			.select({ title: pillars.title, summary: pillars.summary, deliveryStatus: pillars.deliveryStatus })
			.from(pillars)
			.innerJoin(campaigns, eq(pillars.campaignId, campaigns.id))
			.where(and(eq(campaigns.leaderId, leaderId), isNull(pillars.deletedAt)))
	]);

	const delivered = pillarRows.filter((p) => p.deliveryStatus === 'delivered').length;
	const base = { followers: followerRow.n, pledges: pledgeRow.n, postCount: postRow.n, delivered };
	return {
		name: fullName(user),
		path: leaderPath(user),
		photoUrl: user.photoUrl,
		positionTitle: position.title,
		regionLabel: position.region,
		party,
		partyPath: party ? `/parties/${slugify(party)}` : null,
		status: leader.status,
		verified: !!leader.verifiedAt,
		pillarCount: pillarRows.length,
		bio: user.bio ?? '',
		pillars: pillarRows,
		...base,
		score: engagementScore(base)
	} satisfies LeaderMetrics;
}

/** This leader's current live membership name (no end date), or null. */
async function currentPartyName(leaderId: number): Promise<string | null> {
	const [row] = await db
		.select({ partyName: parties.name })
		.from(partyMemberships)
		.innerJoin(parties, eq(partyMemberships.partyId, parties.id))
		.where(and(eq(partyMemberships.leaderId, leaderId), isNull(partyMemberships.deletedAt), isNull(partyMemberships.endAt)));
	return row?.partyName ?? null;
}

/**
 * Metrics for a single leader by their flat URL path (/<slug>) — used by /compare,
 * which only ever needs two leaders, so it fetches exactly those instead of
 * computing the whole register and discarding all but two. resolveCurrentTerm
 * picks the same canonical (non-former) term the full listing dedups to, so the
 * numbers match. Returns null for an unknown or unverified leader (only verified
 * profiles are public).
 */
export async function getLeaderMetricsByPath(path: string): Promise<LeaderMetrics | null> {
	const slug = path.replace(/^\//, '').trim();
	if (!slug) return null;
	const resolved = await resolveCurrentTerm(slug);
	if (!resolved || !resolved.currentTerm.leaders.verifiedAt) return null;
	const { leaders: leaderRow, positions: positionRow } = resolved.currentTerm;
	const party = await currentPartyName(leaderRow.id);
	return computeLeaderMetrics(leaderRow, positionRow, resolved.row.users, party);
}

/** A random verified aspirant path for one position (e.g. the /compare default). */
export async function randomVerifiedAspirantPath(positionTitle: string): Promise<string | null> {
	const rows = await db
		.select({ slug: users.slug })
		.from(leaders)
		.innerJoin(positions, eq(leaders.positionId, positions.id))
		.innerJoin(users, eq(leaders.userId, users.id))
		.where(
			and(
				isNull(leaders.deletedAt),
				isNotNull(leaders.verifiedAt),
				eq(positions.title, positionTitle),
				eq(leaders.status, 'aspirant')
			)
		);
	const slugs = rows.map((r) => r.slug).filter((s): s is string => !!s);
	if (!slugs.length) return null;
	return `/${slugs[Math.floor(Math.random() * slugs.length)]}`;
}

/** One row of a /rank/[position] table: the score inputs, no bio/pillar bodies. */
export type RankedLeaderMetrics = {
	rank: number;
	name: string;
	path: string;
	photoUrl: string | null;
	regionLabel: string;
	status: string;
	followers: number;
	pledges: number;
	postCount: number;
	pillarCount: number;
	delivered: number;
	score: number;
};

/**
 * One position's verified leaders (every status: current, aspirant, former)
 * ranked by engagement score, paginated server-side. Batched: 5 queries total
 * no matter how many leaders the position has — the whole set must be scored to
 * rank it, but only the requested page's rows ship to the client.
 */
export async function listPositionMetrics(
	positionTitle: string,
	page: number,
	pageSize: number
): Promise<{ total: number; leaders: RankedLeaderMetrics[] }> {
	const rows = await db
		.select({
			leaderId: leaders.id,
			slug: users.slug,
			firstName: users.firstName,
			otherNames: users.otherNames,
			photoUrl: users.photoUrl,
			status: leaders.status,
			region: positions.region
		})
		.from(leaders)
		.innerJoin(positions, eq(leaders.positionId, positions.id))
		.innerJoin(users, eq(leaders.userId, users.id))
		.where(and(isNull(leaders.deletedAt), isNotNull(leaders.verifiedAt), eq(positions.title, positionTitle)));

	// A person can have several `leaders` rows (Track Record) sharing one flat
	// URL; keep one entry per slug, preferring their non-'former' row.
	const bySlug = new Map<string, (typeof rows)[number]>();
	for (const r of rows) {
		if (!r.slug) continue;
		const existing = bySlug.get(r.slug);
		if (!existing || (existing.status === 'former' && r.status !== 'former')) bySlug.set(r.slug, r);
	}
	const people = [...bySlug.values()];
	if (people.length === 0) return { total: 0, leaders: [] };
	const ids = people.map((p) => p.leaderId);

	// The four score inputs, each one grouped query over the whole position.
	const [followerRows, pledgeRows, postRows, pillarRows] = await Promise.all([
		db
			.select({ leaderId: followers.digestId, n: count() })
			.from(followers)
			.where(and(eq(followers.digest, 'leader'), inArray(followers.digestId, ids), isNull(followers.deletedAt)))
			.groupBy(followers.digestId),
		db
			.select({ leaderId: campaigns.leaderId, n: count() })
			.from(pledges)
			.innerJoin(campaigns, eq(pledges.campaignId, campaigns.id))
			.where(and(inArray(campaigns.leaderId, ids), isNull(pledges.deletedAt)))
			.groupBy(campaigns.leaderId),
		db
			.select({ leaderId: posts.leaderId, n: count() })
			.from(posts)
			.where(and(inArray(posts.leaderId, ids), eq(posts.medium, 'web'), eq(posts.public, true), isNull(posts.deletedAt)))
			.groupBy(posts.leaderId),
		db
			.select({
				leaderId: campaigns.leaderId,
				n: count(),
				delivered: sql<number>`count(*) filter (where ${pillars.deliveryStatus} = 'delivered')`.mapWith(Number)
			})
			.from(pillars)
			.innerJoin(campaigns, eq(pillars.campaignId, campaigns.id))
			.where(and(inArray(campaigns.leaderId, ids), isNull(pillars.deletedAt)))
			.groupBy(campaigns.leaderId)
	]);
	const followersBy = new Map(followerRows.map((r) => [r.leaderId, r.n]));
	const pledgesBy = new Map(pledgeRows.map((r) => [r.leaderId, r.n]));
	const postsBy = new Map(postRows.map((r) => [r.leaderId, r.n]));
	const pillarsBy = new Map(pillarRows.map((r) => [r.leaderId, r]));

	const scored = people
		.map((p) => {
			const base = {
				followers: followersBy.get(p.leaderId) ?? 0,
				pledges: pledgesBy.get(p.leaderId) ?? 0,
				postCount: postsBy.get(p.leaderId) ?? 0,
				delivered: pillarsBy.get(p.leaderId)?.delivered ?? 0
			};
			return {
				name: fullName(p),
				path: leaderPath(p),
				photoUrl: p.photoUrl,
				regionLabel: p.region,
				status: p.status,
				pillarCount: pillarsBy.get(p.leaderId)?.n ?? 0,
				...base,
				score: engagementScore(base)
			};
		})
		.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

	return {
		total: scored.length,
		leaders: scored
			.slice((page - 1) * pageSize, page * pageSize)
			.map((l, i) => ({ ...l, rank: (page - 1) * pageSize + i + 1 }))
	};
}
