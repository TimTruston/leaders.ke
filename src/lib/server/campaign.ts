// Shared loader behind the /[leader]/[year] campaign workspace — extracted so an
// admin (reviewing a pending application/claim) and the applicant themselves (or
// an active manager) can preview a not-yet-verified campaign through the exact
// same Campaign component real citizens will eventually see, reached via
// LeaderProfile's "Open campaign" link. Anyone else still hits the verified gate.
import { and, asc, count, desc, eq, isNull, sum } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, donations, followers, managers, pillars, pledges, positions, posts } from '$lib/server/db/schema';
import { ACTIVE_CYCLE, resolveCurrentTerm } from '$lib/server/leader';
import { getFlaggedReviewCounts, getMyReview, listApprovedReviews, listReviewPillarOptions } from '$lib/server/reviews';

/** Resolves the seat + run a /[leader]/[year] workspace leads with (a live term,
 * else the active run). Verified is required UNLESS the viewer is an admin, the
 * profile's own person, or one of its active managers — the same "can this
 * account see the draft" rule used elsewhere for admin/claim previews. */
export async function resolveCampaignRun(slug: string, opts: { viewerId?: number; isAdmin?: boolean } = {}) {
	const resolved = await resolveCurrentTerm(slug);
	if (!resolved) return null;
	const { row, currentTerm } = resolved;
	let { activeRun } = resolved;
	const leadsWithRun = (!currentTerm || currentTerm.leaders.status === 'former') && !!activeRun;
	const verified = leadsWithRun ? !!activeRun!.campaigns.verifiedAt : !!currentTerm?.leaders.verifiedAt;

	if (!verified) {
		const canPreview =
			opts.isAdmin ||
			opts.viewerId === row.users.id ||
			(opts.viewerId
				? !!(
						await db
							.select({ id: managers.id })
							.from(managers)
							.where(and(eq(managers.userId, opts.viewerId), eq(managers.subjectUserId, row.users.id), isNull(managers.deletedAt)))
					)[0]
				: false);
		if (!canPreview) return null;

		// resolveCurrentTerm's activeRun is verified-only (drives public resolution).
		// A previewer with no held term and no verified run yet is a pure aspirant
		// whose draft run hasn't been verified — fall back to their current-cycle
		// run regardless of verified state (same pattern as publicProfile.ts).
		if (!currentTerm && !activeRun) {
			const [draftRun] = await db
				.select()
				.from(campaigns)
				.innerJoin(positions, eq(campaigns.positionId, positions.id))
				.where(and(eq(campaigns.subjectUserId, row.users.id), eq(campaigns.cycleYear, ACTIVE_CYCLE), isNull(campaigns.parentCampaignId), isNull(campaigns.deletedAt)));
			if (!draftRun) return null;
			activeRun = draftRun;
		}
	}

	const stillLeadsWithRun = (!currentTerm || currentTerm.leaders.status === 'former') && !!activeRun;
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
		const [c] = await db
			.select({ id: campaigns.id })
			.from(campaigns)
			.where(and(eq(campaigns.leaderId, leaderId), isNull(campaigns.parentCampaignId), isNull(campaigns.deletedAt)));
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
				.select({ id: campaigns.id, fundraisingGoal: campaigns.fundraisingGoal })
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

	return {
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
