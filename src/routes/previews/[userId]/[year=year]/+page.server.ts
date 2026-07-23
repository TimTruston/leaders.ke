import { error, redirect } from '@sveltejs/kit';
import { ACTIVE_CYCLE, campaignPath, fullName, getDomainUser } from '$lib/server/leader';
import { resolveCampaignRun, loadCampaignWorkspaceData } from '$lib/server/campaign';
import type { PageServerLoad } from './$types';

// /previews/[userId]/[year]: the campaign workspace of an application with no
// public slug yet — the slugless twin of /[leader]/[year], keyed by the person's
// user id since there's no slug to resolve by until an admin approves one. Public,
// same as everywhere else (see docs/URLDiscovery.md). Read-only: the public
// follow/donate/review/ask actions belong to the live /[leader]/[year].
export const load: PageServerLoad = async ({ params, locals }) => {
	const recordPath = `/previews/${params.userId}`;
	if (Number(params.year) !== ACTIVE_CYCLE) redirect(302, recordPath);

	const viewer = locals.user ? await getDomainUser(locals.user.id) : null;
	const row = await resolveCampaignRun(Number(params.userId));
	if (!row) error(404, 'Campaign not found');
	// Once approved the run is public — hand off to the canonical /[slug]/[year] URL.
	if (row.verified && row.users.slug) redirect(302, campaignPath({ slug: row.users.slug }, Number(params.year)));

	const workspace = await loadCampaignWorkspaceData(row, viewer?.id);
	const name = fullName(row.users);

	return {
		year: Number(params.year),
		recordPath,
		leader: {
			name,
			initials: name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
			photoUrl: row.users.photoUrl,
			party: workspace.party,
			regionLabel: row.positions.region,
			positionTitle: row.positions.title,
			status: row.status,
			verified: row.verified,
			followers: workspace.followers,
			// The run's own pitch (Campaign tab), not the person's general profile bio —
			// this workspace is about the 2027 campaign specifically.
			campaignTitle: workspace.title,
			campaignDescription: workspace.description,
			pillars: workspace.pillars
		},
		posts: workspace.posts,
		reviews: workspace.reviews,
		reviewPillarOptions: workspace.reviewPillarOptions,
		flaggedReviewCounts: workspace.flaggedReviewCounts,
		myReview: workspace.myReview,
		signedIn: !!locals.user,
		pledgeCount: workspace.pledgeCount,
		fundraising: workspace.fundraising
	};
};
