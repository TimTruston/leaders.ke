import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/dashboard';
import { listVerifications, reviewVerification } from '$lib/server/verifications';
import type { Actions, PageServerLoad } from './$types';

const PAGE_SIZE = 50;

// Every verification request, table view: approve, reject, or revert a past approval.
export const load: PageServerLoad = async (event) => {
	await requireAdmin(event);
	const page = Math.max(1, Number(event.url.searchParams.get('page') ?? 1));
	const { requests, total } = await listVerifications(page, PAGE_SIZE);
	return { requests, total, page, pageSize: PAGE_SIZE };
};

export const actions: Actions = {
	review: async (event) => {
		const { domainUser } = await requireAdmin(event);
		const form = await event.request.formData();
		const verificationId = Number(form.get('verificationId'));
		const outcome = String(form.get('outcome') ?? '');
		const notes = String(form.get('notes') ?? '').trim();

		if (!verificationId || (outcome !== 'approved' && outcome !== 'rejected')) {
			return fail(400, { error: 'Invalid request.' });
		}

		const result = await reviewVerification(verificationId, domainUser.id, outcome, notes);
		if (!result.ok) return fail(400, { error: result.error });

		return { reviewed: true };
	}
};
