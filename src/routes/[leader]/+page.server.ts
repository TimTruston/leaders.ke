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
	const { row, terms, currentTerm, activeRun } = resolved;

	const viewer = locals.user ? await getDomainUser(locals.user.id) : null;

	// The seat the profile leads with: a live/held term if they hold or held office,
	// else their active RUN (a campaign — how an aspirant with no leaders row is public).
	const leadsWithRun = (!currentTerm || currentTerm.leaders.status === 'former') && !!activeRun;
	const leadPosition = leadsWithRun ? activeRun!.positions : (currentTerm?.positions ?? activeRun?.positions ?? null);
	const leadStatus = leadsWithRun ? 'aspirant' : (currentTerm?.leaders.status ?? 'aspirant');
	const leadVerified = leadsWithRun ? !!activeRun!.campaigns.verifiedAt : !!currentTerm?.leaders.verifiedAt;

	// Public only when the lead seat (held term or run) is verified. Admins see drafts.
	if (!leadPosition || (!leadVerified && !viewer?.adminAt)) error(404, 'Leader not found');

	// The lead campaign carries the manifesto shown this cycle: the run if vying, else
	// the current term's own campaign (0 = none, e.g. a former officeholder not running).
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
			db
				.select({ n: count() })
				.from(pillars)
				.where(and(eq(pillars.campaignId, leadCampaignId), isNull(pillars.deletedAt))),
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
			// Delivery tracker rollup for the public delivery score.
			db
				.select({ deliveryStatus: pillars.deliveryStatus })
				.from(pillars)
				.where(and(eq(pillars.campaignId, leadCampaignId), isNull(pillars.deletedAt))),
			// "In the news": aggregated coverage tagged to this person.
			db
				.select({ id: posts.id, title: posts.title, summary: posts.aiSummary, body: posts.body, createdAt: posts.createdAt })
				.from(tags)
				.innerJoin(posts, eq(tags.postId, posts.id))
				.where(and(eq(tags.subjectUserId, row.users.id), isNull(tags.deletedAt), isNull(posts.deletedAt)))
				.orderBy(desc(posts.createdAt))
				.limit(10),
			// Education + professional history belongs to the person, so it spans every
			// term and shows even for an aspirant with no leaders row.
			db
				.select({ type: experience.type, title: experience.title, institution: experience.institution, description: experience.description, from: experience.startAt, to: experience.endAt })
				.from(experience)
				.where(and(eq(experience.subjectUserId, row.users.id), isNull(experience.deletedAt)))
				.orderBy(desc(experience.startAt)),
			// Public contact channels (email/sms), verified ones surface first.
			db
				.select({ channel: contacts.channel, value: contacts.value, verifiedAt: contacts.verifiedAt })
				.from(contacts)
				.where(and(eq(contacts.userId, row.users.id), isNull(contacts.deletedAt))),
			// Citizen reviews of this person (follows them across every seat), plus
			// this campaign's pillar options for the review form.
			listApprovedReviews(row.users.id, viewer?.id),
			listReviewPillarOptions(leadCampaignId),
			getFlaggedReviewCounts(row.users.id)
		]);

	const myReview = viewer ? await getMyReview(row.users.id, viewer.id) : null;

	// "Claim this profile" only makes sense if the viewer isn't already a manager here.
	const viewerIsManager = viewer
		? !!(
				await db
					.select({ id: managers.id })
					.from(managers)
					.where(and(eq(managers.userId, viewer.id), eq(managers.subjectUserId, row.users.id), isNull(managers.deletedAt)))
			)[0]
		: false;

	const deliveredCount = pillarStatusRows.filter((p) => p.deliveryStatus === 'delivered').length;
	const inProgressCount = pillarStatusRows.filter((p) => p.deliveryStatus === 'in_progress').length;

	const name = fullName(row.users);
	// Vying = leads with a current term or an active run (anything but a retired former).
	const isVying = leadStatus !== 'former';

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
			positionTitle: leadPosition.title,
			// Single-region national seats (President) omit the region segment, matching /president.
			regionLabel: leadPosition.boundary === 'Country' ? null : leadPosition.region,
			positionPath: `/${positionSlug(leadPosition.title)}`,
			// Country-wide seats' hub lives at the SINGULAR slug (/president).
			seatPath:
				leadPosition.boundary === 'Country'
					? `/${SINGULAR_SLUG_BY_TITLE[leadPosition.title]}`
					: `/${positionSlug(leadPosition.title)}/${slugify(leadPosition.region)}`,
			seatCyclePath: `/${positionSlug(leadPosition.title)}/${slugify(leadPosition.region)}`
		}
	};
};

// Resolves a slug to its public review target: the person id plus the lead campaign
// (for pillar validation). Null when the profile isn't public (unverified term/run).
async function publicLead(slug: string): Promise<{ subjectId: number; leadCampaignId: number } | null> {
	const resolved = await resolveCurrentTerm(slug);
	if (!resolved) return null;
	const { row, currentTerm, activeRun } = resolved;
	const leadsWithRun = (!currentTerm || currentTerm.leaders.status === 'former') && !!activeRun;
	const leadVerified = leadsWithRun ? !!activeRun!.campaigns.verifiedAt : !!currentTerm?.leaders.verifiedAt;
	if (!leadVerified) return null;
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
	return { subjectId: row.users.id, leadCampaignId };
}

export const actions: Actions = {
	review: async (event) => {
		const lead = await publicLead(event.params.leader);
		if (!lead) error(404, 'Leader not found');
		return await handleReviewAction(event, lead.subjectId, lead.leadCampaignId);
	},

	deleteReview: async (event) => {
		const lead = await publicLead(event.params.leader);
		if (!lead) error(404, 'Leader not found');
		return await handleDeleteReviewAction(event, lead.subjectId);
	}
};
