import { fail } from '@sveltejs/kit';
import { requireLeader } from '$lib/server/dashboard';
import {
	listReviewPillarOptions,
	listReviewsForModeration,
	respondToReview,
	setReviewFlag,
	REVIEW_FLAG_REASONS,
	type ReviewFlagReason
} from '$lib/server/reviews';
import { getPageSize } from '$lib/server/settings';
import { getRunCampaign } from '$lib/server/leader';
import type { Actions, PageServerLoad } from './$types';

// Moderation queue for citizen reviews of this leader (the person, across every
// seat they've held or vied for): flag/unflag, and respond in the review's thread.
export const load: PageServerLoad = async (event) => {
	const { ctx } = await requireLeader(event);
	const pageSize = await getPageSize();
	const page = Math.max(1, Number(event.url.searchParams.get('page') ?? 1));

	// Pillar options come from the person's run this cycle (their 2027 campaign).
	const run = await getRunCampaign(ctx.profileUser.id);
	const [{ reviews, total }, pillarOptions] = await Promise.all([
		listReviewsForModeration(ctx.profileUser.id, page, pageSize),
		listReviewPillarOptions(run?.id ?? 0)
	]);

	return { reviews, total, page, pageSize, pillarOptions, flagReasons: REVIEW_FLAG_REASONS };
};

export const actions: Actions = {
	flag: async (event) => {
		const { ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const reviewId = Number(form.get('reviewId'));
		const reason = String(form.get('reason') ?? '');
		if (!reviewId) return fail(400, { error: 'Review not found.' });
		if (!REVIEW_FLAG_REASONS.includes(reason as ReviewFlagReason)) {
			return fail(400, { error: 'Pick a reason to flag this review.' });
		}
		await setReviewFlag(ctx.profileUser.id, reviewId, reason as ReviewFlagReason);
		return { moderated: true };
	},

	unflag: async (event) => {
		const { ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const reviewId = Number(form.get('reviewId'));
		if (!reviewId) return fail(400, { error: 'Review not found.' });
		await setReviewFlag(ctx.profileUser.id, reviewId, null);
		return { moderated: true };
	},

	respond: async (event) => {
		const { domainUser, ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const reviewId = Number(form.get('reviewId'));
		const body = String(form.get('body') ?? '').trim();
		if (!reviewId || !body) return fail(400, { error: 'Write a response first.' });

		const ok = await respondToReview(
			ctx.profileUser.id,
			(ctx.leader?.id ?? 0),
			reviewId,
			ctx.role,
			domainUser.id,
			body
		);
		if (!ok) return fail(400, { error: 'Review not found.' });
		return { responded: true };
	}
};
