import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/dashboard';
import { listFlaggedReviews, unflagReview } from '$lib/server/moderation';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	await requireAdmin(event);
	return { flagged: await listFlaggedReviews() };
};

export const actions: Actions = {
	unflag: async (event) => {
		await requireAdmin(event);
		const form = await event.request.formData();
		const reviewId = Number(form.get('reviewId') ?? 0);
		if (!reviewId) return fail(400, { error: 'Invalid request.' });

		await unflagReview(reviewId);
		return { unflagged: true };
	}
};
