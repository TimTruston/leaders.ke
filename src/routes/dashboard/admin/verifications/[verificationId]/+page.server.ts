import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/dashboard';
import { getVerificationDetail, reviewVerification } from '$lib/server/verifications';
import type { Actions, PageServerLoad } from './$types';

// One verification request in full: the whole application (profile, contacts,
// team, documentation, signoff) plus the leader's request history, so the admin
// reviews the actual submission instead of a bare queue row.
export const load: PageServerLoad = async (event) => {
	await requireAdmin(event);
	const detail = await getVerificationDetail(Number(event.params.verificationId));
	if (!detail) error(404, 'Verification request not found');
	return { detail };
};

export const actions: Actions = {
	review: async (event) => {
		const { domainUser } = await requireAdmin(event);
		const form = await event.request.formData();
		const outcome = String(form.get('outcome') ?? '');
		const notes = String(form.get('notes') ?? '').trim();

		if (outcome !== 'approved' && outcome !== 'rejected') {
			return fail(400, { error: 'Invalid request.' });
		}

		const result = await reviewVerification(Number(event.params.verificationId), domainUser.id, outcome, notes);
		if (!result.ok) return fail(400, { error: result.error });

		return { reviewed: true };
	}
};
