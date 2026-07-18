// Public leader metrics shared by /ranks, /compare and dashboards.
// The engagement score is deliberately transparent: citizens can recompute it.
import { and, count, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
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
		photoUrl: leader.photoUrl,
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

// Public metrics: only verified profiles are listed, per the same rule as /leaders and /search.
export async function listLeaderMetrics(): Promise<LeaderMetrics[]> {
	const rows = await db
		.select()
		.from(leaders)
		.innerJoin(positions, eq(leaders.positionId, positions.id))
		.innerJoin(users, eq(leaders.userId, users.id))
		.where(and(isNull(leaders.deletedAt), isNotNull(leaders.verifiedAt)));

	// Current party per leader in one batched query (same rule as seat hubs:
	// a live membership is one with no end date).
	const leaderIds = rows.map((r) => r.leaders.id);
	const partyRows = leaderIds.length
		? await db
				.select({ leaderId: partyMemberships.leaderId, partyName: parties.name })
				.from(partyMemberships)
				.innerJoin(parties, eq(partyMemberships.partyId, parties.id))
				.where(and(inArray(partyMemberships.leaderId, leaderIds), isNull(partyMemberships.deletedAt), isNull(partyMemberships.endAt)))
		: [];
	const partyByLeaderId = new Map(partyRows.map((p) => [p.leaderId, p.partyName]));

	const dbMetrics = await Promise.all(
		rows.map((r) => computeLeaderMetrics(r.leaders, r.positions, r.users, partyByLeaderId.get(r.leaders.id) ?? null))
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
