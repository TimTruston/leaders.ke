import { error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns } from '$lib/server/db/schema';
import { ACTIVE_CYCLE, getDomainUser, resolveCurrentTerm } from '$lib/server/leader';
import { loadPublicProfileData } from '$lib/server/publicProfile';
import { handleDeleteReviewAction, handleReviewAction } from '$lib/server/reviews';
import type { Actions, PageServerLoad } from './$types';

// /[leader]: the permanent leader record — bio, verified track record across
// every seat they've held or are vying for, education/professional experience,
// and a pointer to the active campaign workspace at /[leader]/[year]. The bulk
// of the data-loading lives in $lib/server/publicProfile so admin previews
// (a pending application, a pending claim) can render the exact same shape.
export const load: PageServerLoad = async ({ params, locals }) => {
	const viewer = locals.user ? await getDomainUser(locals.user.id) : null;

	const data = await loadPublicProfileData(params.leader, { viewerId: viewer?.id, isAdmin: !!viewer?.adminAt });
	if (!data) error(404, 'Leader not found');
	return data;
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
		// Person+cycle scoped (subjectUserId), same key as an aspirant's activeRun —
		// leaderId on `campaigns` is only ever a nullable secondary link, never the
		// lookup key (seed-campaigns.ts never sets it).
		const [c] = await db
			.select({ id: campaigns.id })
			.from(campaigns)
			.where(and(eq(campaigns.subjectUserId, row.users.id), eq(campaigns.cycleYear, ACTIVE_CYCLE), isNull(campaigns.parentCampaignId), isNull(campaigns.deletedAt)));
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
