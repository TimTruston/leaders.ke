import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/dashboard';
import { graduateCampaign, listCandidates } from '$lib/server/candidates';
import { getPageSize } from '$lib/server/settings';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	await requireAdmin(event);
	const pageSize = await getPageSize();
	const page = Math.max(1, Number(event.url.searchParams.get('page') ?? 1));
	const { candidates, total } = await listCandidates(page, pageSize);
	return { candidates, total, page, pageSize };
};

export const actions: Actions = {
	// Record a win: graduate a verified 2027 run into a current leaders term.
	graduate: async (event) => {
		await requireAdmin(event);
		const form = await event.request.formData();
		const campaignId = Number(form.get('campaignId'));
		if (!Number.isInteger(campaignId)) return fail(400, { error: 'Invalid run.' });
		const result = await graduateCampaign(campaignId);
		if (!result) return fail(400, { error: 'This run can no longer be graduated.' });
		return { graduated: true };
	}
};
