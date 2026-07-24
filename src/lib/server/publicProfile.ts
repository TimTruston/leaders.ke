// Shared data loader behind the public /[leader] page — extracted so admin
// previews (a pending application's live profile, a pending claim's staged
// overlay) can render through the exact same LeaderProfile component instead of
// a bespoke admin-only layout. Every non-deactivated profile is public;
// verifiedAt is a "Verified" badge only (see docs/URLDiscovery.md), not a
// visibility gate — an application goes live as soon as it exists.
import { and, asc, count, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, contacts, deliveries, experience, followers, managers, parties, pillars, pledges, positions, posts, tags } from '$lib/server/db/schema';
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
	const { row, terms, currentTerm, activeRun } = resolved;

	// Whether the viewer manages this profile — used for `canClaim`/`canEdit` below
	// (editing access), not for visibility (every non-deactivated profile is public).
	const viewerIsManager = opts.viewerId
		? opts.viewerId === row.users.id ||
			!!(
				await db
					.select({ id: managers.id })
					.from(managers)
					.where(and(eq(managers.userId, opts.viewerId), eq(managers.subjectUserId, row.users.id), isNull(managers.deletedAt)))
			)[0]
		: false;

	// Only seeded/unowned profiles are claimable — an applied (or already-claimed)
	// profile has an active manager, so "claim this" must not appear for it.
	const hasActiveManager = !!(
		await db
			.select({ id: managers.id })
			.from(managers)
			.where(and(eq(managers.subjectUserId, row.users.id), eq(managers.isActive, true), isNull(managers.deletedAt)))
	)[0];

	const leadsWithRun = (!currentTerm || currentTerm.leaders.status === 'former') && !!activeRun;
	const leadPosition = leadsWithRun ? activeRun!.positions : (currentTerm?.positions ?? activeRun?.positions ?? null);
	const leadStatus = leadsWithRun ? 'aspirant' : (currentTerm?.leaders.status ?? 'aspirant');
	const leadVerified = leadsWithRun ? !!activeRun!.campaigns.verifiedAt : !!currentTerm?.leaders.verifiedAt;

	if (!leadPosition) return null;

	let leadCampaignId = 0;
	if (leadsWithRun) {
		leadCampaignId = activeRun!.campaigns.id;
	} else if (currentTerm) {
		// Campaigns are person+cycle scoped (subjectUserId), same key as an
		// aspirant's activeRun — leaderId on `campaigns` is only ever a nullable
		// secondary link (seed-campaigns.ts never sets it), never the lookup key.
		const [c] = await db
			.select({ id: campaigns.id })
			.from(campaigns)
			.where(and(eq(campaigns.subjectUserId, row.users.id), eq(campaigns.cycleYear, ACTIVE_CYCLE), isNull(campaigns.parentCampaignId), isNull(campaigns.deletedAt)));
		leadCampaignId = c?.id ?? 0;
	}

	const [
		[pillarRow],
		[followerRow],
		[contestantRow],
		[pledgeRow],
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
		// Verified 2027 runs at this exact seat — same definition seatHub uses for
		// its own contestants list (aspirants only; a graduated run's leaderId is
		// set, so it's the current holder now, not a contestant).
		db
			.select({ n: count() })
			.from(campaigns)
			.where(
				and(
					eq(campaigns.positionId, leadPosition.id),
					eq(campaigns.cycleYear, ACTIVE_CYCLE),
					isNull(campaigns.parentCampaignId),
					isNotNull(campaigns.verifiedAt),
					isNull(campaigns.leaderId),
					isNull(campaigns.deletedAt)
				)
			),
		// Person-scoped across every campaign they've run (not just the lead one) —
		// same convention as the campaign workspace's own pledgeCount.
		db
			.select({ n: count() })
			.from(pledges)
			.innerJoin(campaigns, eq(pledges.campaignId, campaigns.id))
			.where(and(eq(campaigns.subjectUserId, row.users.id), isNull(pledges.deletedAt))),
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
			.select({ id: experience.id, type: experience.type, title: experience.title, institution: experience.institution, description: experience.description, from: experience.startAt, to: experience.endAt })
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

	// Party is per-term/per-run (leaders.partyId / campaigns.partyId), not a
	// person-level fact — a person can switch parties between terms. Batch-resolve
	// every partyId this profile needs: the lead seat's own (headline badge) plus
	// each historical Track Record entry's own (shown "as of" that term, not today's).
	const leadPartyId = leadsWithRun ? activeRun!.campaigns.partyId : (currentTerm?.leaders.partyId ?? null);
	const trackRecordPartyIds = terms.map((t) => t.leaders.partyId);
	const partyIds = [...new Set([leadPartyId, ...trackRecordPartyIds].filter((id): id is number => id !== null))];
	const partyNameRows = partyIds.length ? await db.select({ id: parties.id, name: parties.name }).from(parties).where(inArray(parties.id, partyIds)) : [];
	const partyNameById = new Map(partyNameRows.map((p) => [p.id, p.name]));

	const myReview = opts.viewerId ? await getMyReview(row.users.id, opts.viewerId) : null;

	// Delivery tab items (concrete things delivered, tied to a specific term or
	// non-elective experience — see the dashboard's Delivery tab) — distinct from
	// `delivery` below, which is the manifesto pillar completion rollup. Only
	// PINNED deliveries are public (capped at 5, enforced when pinning), ordered
	// by when the leader pinned them.
	const leaderIds = terms.map((t) => t.leaders.id);
	const experienceIds = experienceRows.map((e) => e.id);
	const [deliveriesByLeader, deliveriesByExperience] = await Promise.all([
		leaderIds.length
			? db.select({ id: deliveries.id, leaderId: deliveries.leaderId, title: deliveries.title, description: deliveries.description }).from(deliveries).where(and(inArray(deliveries.leaderId, leaderIds), isNotNull(deliveries.pinnedAt), isNull(deliveries.deletedAt))).orderBy(asc(deliveries.pinnedAt))
			: [],
		experienceIds.length
			? db.select({ id: deliveries.id, experienceId: deliveries.experienceId, title: deliveries.title, description: deliveries.description }).from(deliveries).where(and(inArray(deliveries.experienceId, experienceIds), isNotNull(deliveries.pinnedAt), isNull(deliveries.deletedAt))).orderBy(asc(deliveries.pinnedAt))
			: []
	]);
	const deliveryGroups = [
		...terms.map((t) => ({
			label: `${t.positions.title}, ${t.positions.region}`,
			from: t.leaders.startAt.getFullYear(),
			to: t.leaders.endAt?.getFullYear() ?? null,
			items: deliveriesByLeader.filter((d) => d.leaderId === t.leaders.id).map((d) => ({ title: d.title, description: d.description }))
		})),
		...experienceRows
			.filter((e) => e.type === 'professional')
			.map((e) => ({
				label: `${e.title}, ${e.institution}`,
				from: e.from?.getFullYear() ?? null,
				to: e.to?.getFullYear() ?? null,
				items: deliveriesByExperience.filter((d) => d.experienceId === e.id).map((d) => ({ title: d.title, description: d.description }))
			}))
	].filter((g) => g.items.length > 0);

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
			// This term's OWN party, not whatever the person holds today.
			party: t.leaders.partyId ? (partyNameById.get(t.leaders.partyId) ?? null) : null,
			startYear: t.leaders.startAt.getFullYear(),
			endYear: t.leaders.endAt?.getFullYear() ?? null
		}));

	return {
		leader: {
			name,
			slug: row.users.slug,
			initials: name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
			photoUrl: row.users.photoUrl,
			party: leadPartyId ? (partyNameById.get(leadPartyId) ?? null) : null,
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
					institution: t.party ?? undefined,
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
		// isVying alone doesn't mean a campaign exists — seeding no longer
		// auto-creates one (see scripts/lib/people.ts), so a vying person with no
		// `campaigns` row yet gets `campaign: null` and the "No campaign listed"
		// placeholder, not a link into an empty workspace.
		isVying,
		campaign:
			isVying && leadCampaignId
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
		deliveryGroups,
		numContestants: contestantRow.n,
		pledgeCount: pledgeRow.n,
		reviews: reviewRows,
		reviewPillarOptions,
		flaggedReviewCounts,
		myReview,
		canClaim: !viewerIsManager && !hasActiveManager,
		// Someone else already manages this profile — a visitor sees "Claimed &
		// Managed" instead of the claim button (the manager viewing their own
		// public page doesn't need telling).
		isManaged: !viewerIsManager && hasActiveManager,
		// A platform admin, or one of the profile's own managers, already has
		// dashboard access — shown an "Edit this profile" shortcut instead of the
		// citizen-facing "Is this you?" claim flow.
		canEdit: !!opts.isAdmin || viewerIsManager,
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
