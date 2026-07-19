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
import { ACTIVE_CYCLE, fullName, leaderPath, resolveCurrentTerm, slugify } from '$lib/server/leader';

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
	ctx: {
		user: typeof users.$inferSelect;
		position: typeof positions.$inferSelect;
		status: string;
		verified: boolean;
		campaignId: number; // the lead campaign (0 = none); pillars read off it
	},
	party: string | null
): Promise<LeaderMetrics> {
	const { user, position, campaignId } = ctx;
	const [[followerRow], [pledgeRow], [postRow], pillarRows] = await Promise.all([
		db
			.select({ n: count() })
			.from(followers)
			.where(and(eq(followers.digest, 'leader'), eq(followers.digestId, user.id), isNull(followers.deletedAt))),
		// Live vote pledges across all of the person's runs.
		db
			.select({ n: count() })
			.from(pledges)
			.innerJoin(campaigns, eq(pledges.campaignId, campaigns.id))
			.where(and(eq(campaigns.subjectUserId, user.id), isNull(pledges.deletedAt))),
		db
			.select({ n: count() })
			.from(posts)
			.where(and(eq(posts.subjectUserId, user.id), eq(posts.medium, 'web'), eq(posts.public, true), isNull(posts.deletedAt))),
		db
			.select({ title: pillars.title, summary: pillars.summary, deliveryStatus: pillars.deliveryStatus })
			.from(pillars)
			.where(and(eq(pillars.campaignId, campaignId), isNull(pillars.deletedAt)))
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
		status: ctx.status,
		verified: ctx.verified,
		pillarCount: pillarRows.length,
		bio: user.bio ?? '',
		pillars: pillarRows,
		...base,
		score: engagementScore(base)
	} satisfies LeaderMetrics;
}

/** This person's current live membership name (no end date), or null. */
async function currentPartyName(subjectUserId: number): Promise<string | null> {
	const [row] = await db
		.select({ partyName: parties.name })
		.from(partyMemberships)
		.innerJoin(parties, eq(partyMemberships.partyId, parties.id))
		.where(and(eq(partyMemberships.subjectUserId, subjectUserId), isNull(partyMemberships.deletedAt), isNull(partyMemberships.endAt)));
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
	if (!resolved) return null;
	const { row, currentTerm, activeRun } = resolved;

	// Lead seat: a live/held term if any, else the active run (aspirant, no leaders row).
	const leadsWithRun = (!currentTerm || currentTerm.leaders.status === 'former') && !!activeRun;
	const verified = leadsWithRun ? !!activeRun!.campaigns.verifiedAt : !!currentTerm?.leaders.verifiedAt;
	if (!verified) return null;

	const position = leadsWithRun ? activeRun!.positions : currentTerm!.positions;
	const status = leadsWithRun ? 'aspirant' : currentTerm!.leaders.status;
	let campaignId = 0;
	const party: string | null = await currentPartyName(row.users.id);
	if (leadsWithRun) {
		campaignId = activeRun!.campaigns.id;
	} else {
		const [c] = await db
			.select({ id: campaigns.id })
			.from(campaigns)
			.where(and(eq(campaigns.leaderId, currentTerm!.leaders.id), isNull(campaigns.parentCampaignId), isNull(campaigns.deletedAt)));
		campaignId = c?.id ?? 0;
	}
	return computeLeaderMetrics({ user: row.users, position, status, verified, campaignId }, party);
}

/** A random verified aspirant path for one position (e.g. the /compare default).
 * An aspirant is a verified 2027 run (campaign), not a leaders row. */
export async function randomVerifiedAspirantPath(positionTitle: string): Promise<string | null> {
	const rows = await db
		.select({ slug: users.slug })
		.from(campaigns)
		.innerJoin(positions, eq(campaigns.positionId, positions.id))
		.innerJoin(users, eq(campaigns.subjectUserId, users.id))
		.where(
			and(
				eq(positions.title, positionTitle),
				eq(campaigns.cycleYear, ACTIVE_CYCLE),
				isNull(campaigns.parentCampaignId),
				isNotNull(campaigns.verifiedAt),
				isNull(campaigns.deletedAt)
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
	// Held terms (current/former) at this position.
	const leaderRows = await db
		.select({
			userId: users.id,
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

	// Verified 2027 runs (campaigns) at this position — the aspirants.
	const runRows = await db
		.select({
			userId: users.id,
			slug: users.slug,
			firstName: users.firstName,
			otherNames: users.otherNames,
			photoUrl: users.photoUrl,
			region: positions.region
		})
		.from(campaigns)
		.innerJoin(positions, eq(campaigns.positionId, positions.id))
		.innerJoin(users, eq(campaigns.subjectUserId, users.id))
		.where(
			and(
				eq(positions.title, positionTitle),
				eq(campaigns.cycleYear, ACTIVE_CYCLE),
				isNull(campaigns.parentCampaignId),
				isNotNull(campaigns.verifiedAt),
				isNull(campaigns.deletedAt)
			)
		);

	// One card per person (flat URL). Status precedence for the active cycle:
	// current officeholder > aspirant (has a 2027 run) > former.
	type Card = { userId: number; slug: string | null; firstName: string; otherNames: string; photoUrl: string | null; status: string; region: string };
	const STATUS_RANK: Record<string, number> = { current: 0, aspirant: 1, former: 2 };
	const bySlug = new Map<string, Card>();
	const consider = (c: Card) => {
		if (!c.slug) return;
		const existing = bySlug.get(c.slug);
		if (!existing || (STATUS_RANK[c.status] ?? 3) < (STATUS_RANK[existing.status] ?? 3)) bySlug.set(c.slug, c);
	};
	for (const r of leaderRows) consider(r);
	for (const r of runRows) consider({ ...r, status: 'aspirant' });
	const people = [...bySlug.values()];
	if (people.length === 0) return { total: 0, leaders: [] };
	const personIds = people.map((p) => p.userId);

	// The four score inputs, each one grouped query over the whole position — all
	// PERSON-scoped now (follows/posts on the person; pledges/pillars on the person's runs).
	const [followerRows, pledgeRows, postRows, pillarRows] = await Promise.all([
		db
			.select({ userId: followers.digestId, n: count() })
			.from(followers)
			.where(and(eq(followers.digest, 'leader'), inArray(followers.digestId, personIds), isNull(followers.deletedAt)))
			.groupBy(followers.digestId),
		db
			.select({ userId: campaigns.subjectUserId, n: count() })
			.from(pledges)
			.innerJoin(campaigns, eq(pledges.campaignId, campaigns.id))
			.where(and(inArray(campaigns.subjectUserId, personIds), isNull(pledges.deletedAt)))
			.groupBy(campaigns.subjectUserId),
		db
			.select({ userId: posts.subjectUserId, n: count() })
			.from(posts)
			.where(and(inArray(posts.subjectUserId, personIds), eq(posts.medium, 'web'), eq(posts.public, true), isNull(posts.deletedAt)))
			.groupBy(posts.subjectUserId),
		db
			.select({
				userId: campaigns.subjectUserId,
				n: count(),
				delivered: sql<number>`count(*) filter (where ${pillars.deliveryStatus} = 'delivered')`.mapWith(Number)
			})
			.from(pillars)
			.innerJoin(campaigns, eq(pillars.campaignId, campaigns.id))
			.where(and(inArray(campaigns.subjectUserId, personIds), isNull(pillars.deletedAt)))
			.groupBy(campaigns.subjectUserId)
	]);
	const followersBy = new Map(followerRows.map((r) => [r.userId, r.n]));
	const pledgesBy = new Map(pledgeRows.map((r) => [r.userId, r.n]));
	const postsBy = new Map(postRows.map((r) => [r.userId, r.n]));
	const pillarsBy = new Map(pillarRows.map((r) => [r.userId, r]));

	const scored = people
		.map((p) => {
			const base = {
				followers: followersBy.get(p.userId) ?? 0,
				pledges: pledgesBy.get(p.userId) ?? 0,
				postCount: postsBy.get(p.userId) ?? 0,
				delivered: pillarsBy.get(p.userId)?.delivered ?? 0
			};
			return {
				name: fullName(p),
				path: leaderPath(p),
				photoUrl: p.photoUrl,
				regionLabel: p.region,
				status: p.status,
				pillarCount: pillarsBy.get(p.userId)?.n ?? 0,
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
