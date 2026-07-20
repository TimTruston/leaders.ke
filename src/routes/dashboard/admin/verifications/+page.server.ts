import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/dashboard';
import { listVerifications, reviewVerification } from '$lib/server/verifications';
import { getPageSize } from '$lib/server/settings';
import type { Actions, PageServerLoad } from './$types';

// Every verification request, table view: approve, reject, or revert a past approval.
export const load: PageServerLoad = async (event) => {
	await requireAdmin(event);
	const pageSize = await getPageSize();
	const page = Math.max(1, Number(event.url.searchParams.get('page') ?? 1));
	const { requests, total } = await listVerifications(page, pageSize);
	return { requests, total, page, pageSize };
};

export const actions: Actions = {
	review: async (event) => {
		const { domainUser } = await requireAdmin(event);
		const form = await event.request.formData();
		const verificationId = Number(form.get('verificationId'));
		const outcome = String(form.get('outcome') ?? '');
		const notes = String(form.get('notes') ?? '').trim();
		const slug = String(form.get('slug') ?? '').trim();

		if (!verificationId || (outcome !== 'approved' && outcome !== 'rejected')) {
			return fail(400, { error: 'Invalid request.' });
		}

		const result = await reviewVerification(verificationId, domainUser.id, outcome, notes, slug);
		if (!result.ok) return fail(400, { error: result.error });

		return { reviewed: true };
	}
};
