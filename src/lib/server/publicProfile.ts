// Shared data loader behind the public /[leader] page — extracted so admin
// previews (a pending application's live profile, a pending claim's staged
// overlay) can render through the exact same LeaderProfile component instead of
// a bespoke admin-only layout. `isAdmin` bypasses the verified gate (an admin
// reviewing a submission needs to see the draft); the profile's own person or
// one of its active managers bypasses it too (the applicant previewing their
// own not-yet-verified submission); everything else is identical to what a
// citizen would see once the profile goes public.
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, contacts, experience, followers, managers, pillars, positions, posts, tags } from '$lib/server/db/schema';
import { ACTIVE_CYCLE, campaignPath, fullName, resolveCurrentTerm, resolveCurrentTermByUserId, slugify } from '$lib/server/leader';
import { positionSlug, SINGULAR_SLUG_BY_TITLE } from '$lib/utils/seat';
import { getFlaggedReviewCounts, getMyReview, listApprovedReviews, listReviewPillarOptions } from '$lib/server/reviews';

export type PublicProfileData = NonNullable<Awaited<ReturnType<typeof loadPublicProfileData>>>;

export async function loadPublicProfileData(
	// A public slug, or a person's user id for a slugless preview (an application
	// that hasn't been approved yet has no slug — see /previews/[userId]).
	idOrSlug: string | number,
	opts: { viewerId?: number; isAdmin?: boolean } = {}
) {
	const resolved =
		typeof idOrSlug === 'number' ? await resolveCurrentTermByUserId(idOrSlug) : await resolveCurrentTerm(idOrSlug);
	if (!resolved) return null;
	const { row, terms, currentTerm } = resolved;
	let { activeRun } = resolved;

	// The profile's own person or one of its active managers may preview it
	// unverified too, same as an admin — computed once, reused for the bypass
	// below and for `canClaim` further down.
	const viewerIsManager = opts.viewerId
		? opts.viewerId === row.users.id ||
			!!(
				await db
					.select({ id: managers.id })
					.from(managers)
					.where(and(eq(managers.userId, opts.viewerId), eq(managers.subjectUserId, row.users.id), isNull(managers.deletedAt)))
			)[0]
		: false;
	const canPreview = !!opts.isAdmin || viewerIsManager;

	// resolveCurrentTerm's activeRun is verified-only (it drives public resolution).
	// A previewer with no held term and no verified run yet is a pure aspirant
	// whose draft run hasn't been verified — fall back to their current-cycle
	// run regardless of verified state.
	if (!activeRun && canPreview) {
		const [draftRun] = await db
			.select()
			.from(campaigns)
			.innerJoin(positions, eq(campaigns.positionId, positions.id))
			.where(and(eq(campaigns.subjectUserId, row.users.id), eq(campaigns.cycleYear, ACTIVE_CYCLE), isNull(campaigns.parentCampaignId), isNull(campaigns.deletedAt)));
		if (draftRun) activeRun = draftRun;
	}

	const leadsWithRun = (!currentTerm || currentTerm.leaders.status === 'former') && !!activeRun;
	const leadPosition = leadsWithRun ? activeRun!.positions : (currentTerm?.positions ?? activeRun?.positions ?? null);
	const leadStatus = leadsWithRun ? 'aspirant' : (currentTerm?.leaders.status ?? 'aspirant');
	const leadVerified = leadsWithRun ? !!activeRun!.campaigns.verifiedAt : !!currentTerm?.leaders.verifiedAt;

	if (!leadPosition || (!leadVerified && !canPreview)) return null;

	let leadCampaignId = 0;
	if (leadsWithRun) {
		leadCampaignId = activeRun!.campaigns.id;
	} else if (currentTerm) {
		const [c] = await db
			.select({ id: campaigns.id })
			.from(campaigns)
			.where(and(eq(campaigns.leaderId, currentTerm.leaders.id), isNull(campaigns.parentCampaignId), isNull(campaigns.deletedAt)));
		leadCampaignId = c?.id ?? 0;
	}

	const [
		[pillarRow],
		[followerRow],
		latestPost,
		pillarStatusRows,
		mentionRows,
		experienceRows,
		contactRows,
		reviewRows,
		reviewPillarOptions,
		flaggedReviewCounts
	] = await Promise.all([
		db.select({ n: count() }).from(pillars).where(and(eq(pillars.campaignId, leadCampaignId), isNull(pillars.deletedAt))),
		db
			.select({ n: count() })
			.from(followers)
			.where(and(eq(followers.digest, 'leader'), eq(followers.digestId, row.users.id), isNull(followers.deletedAt))),
		db
			.select({ title: posts.title, createdAt: posts.createdAt })
			.from(posts)
			.where(and(eq(posts.subjectUserId, row.users.id), eq(posts.medium, 'web'), eq(posts.public, true), isNull(posts.deletedAt)))
			.orderBy(desc(posts.createdAt))
			.limit(1),
		db.select({ deliveryStatus: pillars.deliveryStatus }).from(pillars).where(and(eq(pillars.campaignId, leadCampaignId), isNull(pillars.deletedAt))),
		db
			.select({ id: posts.id, title: posts.title, summary: posts.aiSummary, body: posts.body, createdAt: posts.createdAt })
			.from(tags)
			.innerJoin(posts, eq(tags.postId, posts.id))
			.where(and(eq(tags.subjectUserId, row.users.id), isNull(tags.deletedAt), isNull(posts.deletedAt)))
			.orderBy(desc(posts.createdAt))
			.limit(10),
		db
			.select({ type: experience.type, title: experience.title, institution: experience.institution, description: experience.description, from: experience.startAt, to: experience.endAt })
			.from(experience)
			.where(and(eq(experience.subjectUserId, row.users.id), isNull(experience.deletedAt)))
			.orderBy(desc(experience.startAt)),
		db
			.select({ channel: contacts.channel, value: contacts.value, verifiedAt: contacts.verifiedAt })
			.from(contacts)
			.where(and(eq(contacts.userId, row.users.id), isNull(contacts.deletedAt))),
		listApprovedReviews(row.users.id, opts.viewerId),
		listReviewPillarOptions(leadCampaignId),
		getFlaggedReviewCounts(row.users.id)
	]);

	const myReview = opts.viewerId ? await getMyReview(row.users.id, opts.viewerId) : null;

	const deliveredCount = pillarStatusRows.filter((p) => p.deliveryStatus === 'delivered').length;
	const inProgressCount = pillarStatusRows.filter((p) => p.deliveryStatus === 'in_progress').length;

	const name = fullName(row.users);
	const isVying = leadStatus !== 'former';

	const trackRecordItems = terms
		.filter((t) => t.leaders.startAt.getTime() <= Date.now())
		.map((t) => ({
			positionTitle: t.positions.title,
			regionLabel: t.positions.region,
			seatPath: `/${positionSlug(t.positions.title)}/${slugify(t.positions.region)}`,
			status: t.leaders.status,
			note: t.leaders.description,
			startYear: t.leaders.startAt.getFullYear(),
			endYear: t.leaders.endAt?.getFullYear() ?? null
		}));

	return {
		leader: {
			name,
			slug: row.users.slug,
			initials: name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
			photoUrl: row.users.photoUrl,
			party: null as string | null,
			regionLabel: leadPosition.region,
			positionTitle: leadPosition.title,
			positionId: leadPosition.id,
			status: leadStatus,
			verified: leadVerified,
			followers: followerRow.n,
			bio: row.users.bio ?? '',
			address: row.users.address ?? null,
			socials: (row.users.socials ?? {}) as Record<string, string>
		},
		contacts: contactRows.map((c) => ({ channel: c.channel, value: c.value, verified: !!c.verifiedAt })),
		experience: {
			education: experienceRows
				.filter((e) => e.type === 'education')
				.map((e) => ({ title: e.title, institution: e.institution, description: e.description, from: e.from?.getFullYear() ?? null, to: e.to?.getFullYear() ?? null })),
			professional: [
				...trackRecordItems.map((t) => ({
					title: `${t.positionTitle}, ${t.regionLabel}`,
					institution: undefined as string | undefined,
					href: t.seatPath as string | undefined,
					description: t.note,
					badge: t.status as string | undefined,
					from: t.startYear,
					to: t.endYear
				})),
				...experienceRows
					.filter((e) => e.type === 'professional')
					.map((e) => ({
						title: e.title,
						institution: e.institution as string | undefined,
						href: undefined as string | undefined,
						description: e.description,
						badge: undefined as string | undefined,
						from: e.from?.getFullYear() ?? null,
						to: e.to?.getFullYear() ?? null
					}))
			].sort((a, b) => (b.from ?? -Infinity) - (a.from ?? -Infinity))
		},
		campaign: isVying
			? {
					year: ACTIVE_CYCLE,
					// A slugless preview (loaded by user id) links its campaign workspace to
					// the matching /previews/[userId]/[year] route, not the public URL.
					path: typeof idOrSlug === 'number' ? `/previews/${idOrSlug}/${ACTIVE_CYCLE}` : campaignPath(row.users),
					pillarCount: pillarRow.n,
					latestPost: latestPost[0] ? { title: latestPost[0].title, createdAt: latestPost[0].createdAt.toISOString() } : null
				}
			: null,
		delivery: { total: pillarStatusRows.length, delivered: deliveredCount, inProgress: inProgressCount },
		reviews: reviewRows,
		reviewPillarOptions,
		flaggedReviewCounts,
		myReview,
		canClaim: !viewerIsManager,
		signedIn: !!opts.viewerId,
		news: mentionRows.map((m) => ({ id: m.id, title: m.title, summary: m.summary ?? m.body.slice(0, 160), createdAt: m.createdAt.toISOString() })),
		breadcrumb: {
			positionTitle: leadPosition.title,
			regionLabel: leadPosition.boundary === 'Country' ? null : leadPosition.region,
			positionPath: `/${positionSlug(leadPosition.title)}`,
			seatPath: leadPosition.boundary === 'Country' ? `/${SINGULAR_SLUG_BY_TITLE[leadPosition.title]}` : `/${positionSlug(leadPosition.title)}/${slugify(leadPosition.region)}`,
			seatCyclePath: `/${positionSlug(leadPosition.title)}/${slugify(leadPosition.region)}`
		},
		// Not rendered by the public page — exposed so admin previews (verification/
		// claim) can pull the run's iebcCertificateUrl without a second resolve.
		leadCampaignId
	};
}
