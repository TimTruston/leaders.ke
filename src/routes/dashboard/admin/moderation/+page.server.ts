import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/dashboard';
import { listFlaggedReviews, unflagReview } from '$lib/server/moderation';
import { getPageSize } from '$lib/server/settings';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	await requireAdmin(event);
	const pageSize = await getPageSize();
	const page = Math.max(1, Number(event.url.searchParams.get('page') ?? 1));
	const { flagged, total } = await listFlaggedReviews(page, pageSize);
	return { flagged, total, page, pageSize };
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
