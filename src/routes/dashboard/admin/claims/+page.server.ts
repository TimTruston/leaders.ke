import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/dashboard';
import { listClaims, reviewClaim } from '$lib/server/claims';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	await requireAdmin(event);
	return { claims: await listClaims() };
};

export const actions: Actions = {
	review: async (event) => {
		const { domainUser } = await requireAdmin(event);
		const form = await event.request.formData();
		const claimId = Number(form.get('claimId'));
		const outcome = String(form.get('outcome') ?? '');
		const notes = String(form.get('notes') ?? '').trim();

		if (!claimId || (outcome !== 'approved' && outcome !== 'rejected')) {
			return fail(400, { error: 'Invalid request.' });
		}

		const result = await reviewClaim(claimId, domainUser.id, outcome, notes);
		if (!result.ok) return fail(400, { error: result.error });

		return { reviewed: true };
	}
};
