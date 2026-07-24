import { error, fail } from '@sveltejs/kit';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, pillars, posts } from '$lib/server/db/schema';
import { ACTIVE_CYCLE, fullName, getDomainUser, resolveCurrentTerm } from '$lib/server/leader';
import { loadPublicProfileData } from '$lib/server/publicProfile';
import { handleDeleteReviewAction, handleReviewAction } from '$lib/server/reviews';
import { answerConstituentQuestion } from '$lib/server/ai';
import { enforceAskRateLimit } from '$lib/server/aiRateLimit';
import { getGroundingExtras } from '$lib/server/knowledge';
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

// Resolves a slug to its public review target: the person id, the lead campaign
// (for pillar validation) and enough context to ground an AI answer (seat, status,
// bio). Null when there's no held term or run at all.
async function publicLead(slug: string): Promise<{
	subjectId: number;
	leadCampaignId: number;
	name: string;
	positionTitle: string;
	regionLabel: string;
	status: string;
	bio: string;
} | null> {
	const resolved = await resolveCurrentTerm(slug);
	if (!resolved) return null;
	const { row, currentTerm, activeRun } = resolved;
	const leadsWithRun = (!currentTerm || currentTerm.leaders.status === 'former') && !!activeRun;
	if (!currentTerm && !activeRun) return null;
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
	const position = leadsWithRun ? activeRun!.positions : currentTerm!.positions;
	const status = leadsWithRun ? 'aspirant' : currentTerm!.leaders.status;
	return {
		subjectId: row.users.id,
		leadCampaignId,
		name: fullName(row.users),
		positionTitle: position.title,
		regionLabel: position.region,
		status,
		bio: row.users.bio ?? ''
	};
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
	},

	// Same AI constituent chat as the campaign workspace's Ask block, grounded in
	// the same manifesto/posts — available here too so the permanent profile
	// doesn't need a live campaign workspace to answer a question.
	ask: async (event) => {
		const form = await event.request.formData();
		const question = String(form.get('question') ?? '').trim();
		if (!question || question.length < 5) {
			return fail(400, { error: 'Ask a question of at least a few words.' });
		}

		const rateLimit = await enforceAskRateLimit(event);
		if (!rateLimit.ok) return fail(429, { error: rateLimit.error });

		const lead = await publicLead(event.params.leader);
		if (!lead) return fail(404, { error: 'Leader not found.' });

		const [pillarRows, postRows, extras] = await Promise.all([
			lead.leadCampaignId
				? db
						.select({ title: pillars.title, summary: pillars.summary, deliveryStatus: pillars.deliveryStatus, evidence: pillars.evidence })
						.from(pillars)
						.where(and(eq(pillars.campaignId, lead.leadCampaignId), isNull(pillars.deletedAt)))
				: Promise.resolve([]),
			db
				.select({ title: posts.title, body: posts.body })
				.from(posts)
				.where(and(eq(posts.subjectUserId, lead.subjectId), eq(posts.medium, 'web'), eq(posts.public, true), isNull(posts.deletedAt)))
				.orderBy(desc(posts.createdAt))
				.limit(10),
			getGroundingExtras(lead.subjectId)
		]);
		const grounding = {
			name: lead.name,
			positionTitle: lead.positionTitle,
			regionLabel: lead.regionLabel,
			status: lead.status,
			bio: lead.bio,
			pillars: pillarRows,
			posts: postRows,
			...extras
		};

		const { answer, source } = await answerConstituentQuestion(grounding, question);
		return { asked: true, question, answer, answerSource: source };
	}
};
