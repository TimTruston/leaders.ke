import { error } from '@sveltejs/kit';
import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, contacts, experience, followers, managers, pillars, posts, tags } from '$lib/server/db/schema';
import { ACTIVE_CYCLE, campaignPath, fullName, getDomainUser, resolveCurrentTerm, slugify } from '$lib/server/leader';
import { positionSlug, SINGULAR_SLUG_BY_TITLE } from '$lib/utils/seat';
import {
	getFlaggedReviewCounts,
	getMyReview,
	handleDeleteReviewAction,
	handleReviewAction,
	listApprovedReviews,
	listReviewPillarOptions
} from '$lib/server/reviews';
import type { Actions, PageServerLoad } from './$types';

// /[leader]: the permanent leader record — bio, verified track record across
// every seat they've held or are vying for, education/professional experience,
// and a pointer to the active campaign workspace at /[leader]/[year].
export const load: PageServerLoad = async ({ params, locals }) => {
	const resolved = await resolveCurrentTerm(params.leader);

	if (!resolved) error(404, 'Leader not found');
	const { row, terms, currentTerm } = resolved;

	const viewer = locals.user ? await getDomainUser(locals.user.id) : null;

	// Only verified profiles are public; unverified ones stay dashboard-only until
	// IEBC-verified. Admins get through so they can inspect a submission under review.
	if (!currentTerm.leaders.verifiedAt && !viewer?.adminAt) error(404, 'Leader not found');

	const leaderId = currentTerm.leaders.id;
	const allLeaderIds = terms.map((t) => t.leaders.id);

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
			db
				.select({ n: count() })
				.from(pillars)
				.innerJoin(campaigns, eq(pillars.campaignId, campaigns.id))
				.where(and(eq(campaigns.leaderId, leaderId), isNull(pillars.deletedAt))),
			db
				.select({ n: count() })
				.from(followers)
				.where(and(eq(followers.digest, 'leader'), eq(followers.digestId, leaderId), isNull(followers.deletedAt))),
			db
				.select({ title: posts.title, createdAt: posts.createdAt })
				.from(posts)
				.where(and(eq(posts.leaderId, leaderId), eq(posts.medium, 'web'), eq(posts.public, true), isNull(posts.deletedAt)))
				.orderBy(desc(posts.createdAt))
				.limit(1),
			// Delivery tracker rollup for the public delivery score.
			db
				.select({ deliveryStatus: pillars.deliveryStatus })
				.from(pillars)
				.innerJoin(campaigns, eq(pillars.campaignId, campaigns.id))
				.where(and(eq(campaigns.leaderId, leaderId), isNull(pillars.deletedAt))),
			// "In the news": aggregated coverage tagged to this leader (any of their terms).
			db
				.select({ id: posts.id, title: posts.title, summary: posts.aiSummary, body: posts.body, createdAt: posts.createdAt })
				.from(tags)
				.innerJoin(posts, eq(tags.postId, posts.id))
				.where(and(inArray(tags.leaderId, allLeaderIds), isNull(tags.deletedAt), isNull(posts.deletedAt)))
				.orderBy(desc(posts.createdAt))
				.limit(10),
			// Education + professional history spans every term (attached to whichever
			// leaderId existed when it was seeded, not necessarily the current one).
			db
				.select({ type: experience.type, title: experience.title, institution: experience.institution, description: experience.description, from: experience.startAt, to: experience.endAt })
				.from(experience)
				.where(and(inArray(experience.leaderId, allLeaderIds), isNull(experience.deletedAt)))
				.orderBy(desc(experience.startAt)),
			// Public contact channels (email/sms), verified ones surface first.
			db
				.select({ channel: contacts.channel, value: contacts.value, verifiedAt: contacts.verifiedAt })
				.from(contacts)
				.where(and(eq(contacts.userId, row.users.id), isNull(contacts.deletedAt))),
			// Citizen reviews of this person (follows them across every seat), plus
			// this campaign's pillar options for the review form.
			listApprovedReviews(row.users.id, viewer?.id),
			listReviewPillarOptions(leaderId),
			getFlaggedReviewCounts(row.users.id)
		]);

	const myReview = viewer ? await getMyReview(row.users.id, viewer.id) : null;

	// "Claim this profile" only makes sense if the viewer isn't already a manager here.
	const viewerIsManager = viewer
		? !!(
				await db
					.select({ id: managers.id })
					.from(managers)
					.where(and(eq(managers.userId, viewer.id), eq(managers.leaderId, leaderId), isNull(managers.deletedAt)))
			)[0]
		: false;

	const deliveredCount = pillarStatusRows.filter((p) => p.deliveryStatus === 'delivered').length;
	const inProgressCount = pillarStatusRows.filter((p) => p.deliveryStatus === 'in_progress').length;

	const name = fullName(row.users);
	const isVying = currentTerm.leaders.status !== 'former';

	// Vying (a future-dated aspirant term) isn't a track record yet — only seats
	// whose term actually started belong here. Folded into `experience.professional`
	// below rather than shown as its own block.
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
			initials: name
				.split(/\s+/)
				.map((w) => w[0])
				.join('')
				.slice(0, 2)
				.toUpperCase(),
			photoUrl: currentTerm.leaders.photoUrl,
			party: null as string | null,
			regionLabel: currentTerm.positions.region,
			positionTitle: currentTerm.positions.title,
			positionId: currentTerm.positions.id,
			status: currentTerm.leaders.status,
			verified: !!currentTerm.leaders.verifiedAt,
			followers: followerRow.n,
			bio: row.users.bio ?? '',
			address: row.users.address ?? null,
			socials: (row.users.socials ?? {}) as Record<string, string>
		},
		contacts: contactRows.map((c) => ({
			channel: c.channel,
			value: c.value,
			verified: !!c.verifiedAt
		})),
		experience: {
			education: experienceRows
				.filter((e) => e.type === 'education')
				.map((e) => ({ title: e.title, institution: e.institution, description: e.description, from: e.from?.getFullYear() ?? null, to: e.to?.getFullYear() ?? null })),
			// Prior/current elective or nominated seats (Track Record rows) and plain career
			// history (Cabinet posts, jobs, etc.) read oddly split into two blocks — a
			// Vice President or Minister sits right alongside a President or MP in real
			// bios. One combined list, newest first (undated entries sort last).
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
		// Former officeholders have no live campaign; aspirants and incumbents (re-election) do.
		campaign: isVying
			? {
					year: ACTIVE_CYCLE,
					path: campaignPath(row.users),
					pillarCount: pillarRow.n,
					latestPost: latestPost[0]
						? { title: latestPost[0].title, createdAt: latestPost[0].createdAt.toISOString() }
						: null
				}
			: null,
		delivery: {
			total: pillarStatusRows.length,
			delivered: deliveredCount,
			inProgress: inProgressCount
		},
		reviews: reviewRows,
		reviewPillarOptions,
		flaggedReviewCounts,
		myReview,
		canClaim: !viewerIsManager,
		signedIn: !!locals.user,
		news: mentionRows.map((m) => ({
			id: m.id,
			title: m.title,
			summary: m.summary ?? m.body.slice(0, 160),
			createdAt: m.createdAt.toISOString()
		})),
		// The breadcrumb's seat: current campaign's seat if vying, else the most recent past seat.
		// positionPath is always just /[position] (the position-level page); seatPath is the
		// canonical hub link (collapses to positionPath for single-region seats like President);
		// seatCyclePath always carries the region, since the /[year] cycle grid route needs it.
		breadcrumb: {
			positionTitle: currentTerm.positions.title,
			// Single-region national seats (President) omit the region segment, matching /president.
			regionLabel: currentTerm.positions.boundary === 'Country' ? null : currentTerm.positions.region,
			positionPath: `/${positionSlug(currentTerm.positions.title)}`,
			// Country-wide seats' hub lives at the SINGULAR slug (/president).
			seatPath:
				currentTerm.positions.boundary === 'Country'
					? `/${SINGULAR_SLUG_BY_TITLE[currentTerm.positions.title]}`
					: `/${positionSlug(currentTerm.positions.title)}/${slugify(currentTerm.positions.region)}`,
			seatCyclePath: `/${positionSlug(currentTerm.positions.title)}/${slugify(currentTerm.positions.region)}`
		}
	};
};

export const actions: Actions = {
	review: async (event) => {
		const resolved = await resolveCurrentTerm(event.params.leader);
		if (!resolved || !resolved.currentTerm.leaders.verifiedAt) {
			error(404, 'Leader not found');
		}
		return await handleReviewAction(event, resolved.row.users.id, resolved.currentTerm.leaders.id);
	},

	deleteReview: async (event) => {
		const resolved = await resolveCurrentTerm(event.params.leader);
		if (!resolved || !resolved.currentTerm.leaders.verifiedAt) {
			error(404, 'Leader not found');
		}
		return await handleDeleteReviewAction(event, resolved.row.users.id);
	}
};
