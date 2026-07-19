import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/dashboard';
import { getVerificationPreview, reviewVerification } from '$lib/server/verifications';
import type { Actions, PageServerLoad } from './$types';

// One verification request in full: the actual profile as it would render once
// verified (LeaderProfile in preview mode), plus review-only extras (IEBC cert,
// team sign-offs, request history) — the admin reviews the real submission, not
// a bare queue row.
export const load: PageServerLoad = async (event) => {
	await requireAdmin(event);
	const preview = await getVerificationPreview(Number(event.params.verificationId));
	if (!preview) error(404, 'Verification request not found');
	return { preview };
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
