// Shared loader behind the /[leader]/[year] campaign workspace — extracted so an
// admin preview and the real public page render through the exact same Campaign
// component, reached via LeaderProfile's "Open campaign" link. Every non-deactivated
// run is public; verifiedAt is a "Verified" badge only (see docs/URLDiscovery.md).
import { and, asc, count, desc, eq, isNull, sum } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, donations, followers, parties, pillars, pledges, posts } from '$lib/server/db/schema';
import { ACTIVE_CYCLE, resolveCurrentTerm, resolveCurrentTermByUserId } from '$lib/server/leader';
import { getFlaggedReviewCounts, getMyReview, listApprovedReviews, listReviewPillarOptions } from '$lib/server/reviews';

/** Resolves the seat + run a /[leader]/[year] workspace leads with (the run itself
 * whenever one exists — even for an incumbent running for a different seat than
 * they hold — else the held term, for a pure officeholder with no declared run).
 * Null only when the person has neither a held term nor a run. */
export async function resolveCampaignRun(
	// A public slug, or a person's user id for a slugless preview (see
	// /previews/[userId]/[year] — an application has no slug until an admin
	// approves it and mints one, regardless of the verifiedAt badge).
	idOrSlug: string | number
) {
	const resolved =
		typeof idOrSlug === 'number' ? await resolveCurrentTermByUserId(idOrSlug) : await resolveCurrentTerm(idOrSlug);
	if (!resolved) return null;
	const { row, currentTerm, activeRun } = resolved;
	// This page is specifically about the 2027 RUN, not the person's general "lead
	// identity" (that distinction belongs to the /[leader] profile page instead) —
	// so an existing run always wins here, even for an incumbent running for a
	// different/higher seat than the one they currently hold (e.g. a sitting
	// Senator running for President shows President here, not Senator).
	const leadsWithRun = !!activeRun;
	const verified = leadsWithRun ? !!activeRun!.campaigns.verifiedAt : !!currentTerm?.leaders.verifiedAt;

	// Nothing to show at all (no held term, no run) — 404, same as /[leader].
	if (!currentTerm && !activeRun) return null;

	const stillLeadsWithRun = !!activeRun;
	let campaignId = 0;
	let position;
	let status: string;
	let leaderId: number | null = null;
	if (stillLeadsWithRun) {
		campaignId = activeRun!.campaigns.id;
		position = activeRun!.positions;
		status = 'aspirant';
	} else {
		position = currentTerm!.positions;
		status = currentTerm!.leaders.status;
		leaderId = currentTerm!.leaders.id;
		// Person+cycle scoped (subjectUserId), same key as an aspirant's activeRun —
		// leaderId on `campaigns` is only ever a nullable secondary link, never the
		// lookup key (seed-campaigns.ts never sets it).
		const [c] = await db
			.select({ id: campaigns.id })
			.from(campaigns)
			.where(and(eq(campaigns.subjectUserId, row.users.id), eq(campaigns.cycleYear, ACTIVE_CYCLE), isNull(campaigns.parentCampaignId), isNull(campaigns.deletedAt)));
		campaignId = c?.id ?? 0;
	}
	return { users: row.users, positions: position, status, verified, campaignId, leaderId };
}

export type CampaignRun = NonNullable<Awaited<ReturnType<typeof resolveCampaignRun>>>;

/** Everything the campaign workspace page renders: manifesto/delivery, updates,
 * reviews, pledges and fundraising — the same shape whether it's the real public
 * page or an admin/applicant preview of a not-yet-verified run. */
export async function loadCampaignWorkspaceData(row: CampaignRun, viewerId?: number) {
	const campaignId = row.campaignId;

	const [mainCampaign] = campaignId
		? await db
				.select({ id: campaigns.id, title: campaigns.title, description: campaigns.description, fundraisingGoal: campaigns.fundraisingGoal, partyId: campaigns.partyId })
				.from(campaigns)
				.where(and(eq(campaigns.id, campaignId), isNull(campaigns.deletedAt)))
		: [];

	const [pillarRows, postRows, [followerRow], reviewRows, reviewPillarOptions, flaggedReviewCounts, [pledgeRow], [raisedRow]] = await Promise.all([
		db
			.select({ title: pillars.title, summary: pillars.summary, deliveryStatus: pillars.deliveryStatus, evidence: pillars.evidence })
			.from(pillars)
			.where(and(eq(pillars.campaignId, campaignId), isNull(pillars.deletedAt)))
			.orderBy(asc(pillars.id)),
		db
			.select({ id: posts.id, title: posts.title, body: posts.body, createdAt: posts.createdAt })
			.from(posts)
			.where(and(eq(posts.subjectUserId, row.users.id), eq(posts.medium, 'web'), eq(posts.public, true), eq(posts.approved, true), isNull(posts.deletedAt)))
			.orderBy(desc(posts.createdAt))
			.limit(20),
		db
			.select({ n: count() })
			.from(followers)
			.where(and(eq(followers.digest, 'leader'), eq(followers.digestId, row.users.id), isNull(followers.deletedAt))),
		listApprovedReviews(row.users.id, viewerId),
		listReviewPillarOptions(campaignId),
		getFlaggedReviewCounts(row.users.id),
		db
			.select({ n: count() })
			.from(pledges)
			.innerJoin(campaigns, eq(pledges.campaignId, campaigns.id))
			.where(and(eq(campaigns.subjectUserId, row.users.id), isNull(pledges.deletedAt))),
		db
			.select({ total: sum(donations.amount) })
			.from(donations)
			.where(and(eq(donations.campaignId, mainCampaign?.id ?? 0), eq(donations.status, 'confirmed'), isNull(donations.deletedAt)))
	]);

	const myReview = viewerId ? await getMyReview(row.users.id, viewerId) : null;

	// Party is per-run (campaigns.partyId), not a person-level fact — this page is
	// specifically about the RUN (see resolveCampaignRun), so it's this run's own.
	const [partyRow] = mainCampaign?.partyId
		? await db.select({ name: parties.name }).from(parties).where(eq(parties.id, mainCampaign.partyId))
		: [];

	return {
		title: mainCampaign?.title ?? '',
		description: mainCampaign?.description ?? '',
		party: partyRow?.name ?? null,
		pillars: pillarRows,
		posts: postRows.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
		followers: followerRow.n,
		reviews: reviewRows,
		reviewPillarOptions,
		flaggedReviewCounts,
		myReview,
		pledgeCount: pledgeRow.n,
		fundraising: { goal: mainCampaign?.fundraisingGoal ?? 0, raised: Number(raisedRow.total ?? 0) }
	};
}
