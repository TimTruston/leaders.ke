import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/dashboard';
import { listVerifications, reviewVerification, type VerificationSort } from '$lib/server/verifications';
import { getPageSize } from '$lib/server/settings';
import type { Actions, PageServerLoad } from './$types';

const SORTS = new Set<VerificationSort>(['position', 'region', 'user', 'requested', 'outcome']);

// Every verification request, table view: approve, reject, or revert a past approval.
// Search (`q`) and sort (`sort`/`dir`) run server-side so they span every page.
export const load: PageServerLoad = async (event) => {
	await requireAdmin(event);
	const pageSize = await getPageSize();
	const params = event.url.searchParams;
	const page = Math.max(1, Number(params.get('page') ?? 1));
	const q = params.get('q') ?? '';
	const sortParam = params.get('sort') ?? '';
	const sort = SORTS.has(sortParam as VerificationSort) ? (sortParam as VerificationSort) : undefined;
	const dir = params.get('dir') === 'asc' ? 'asc' : 'desc';
	const { requests, total } = await listVerifications(page, pageSize, { q, sort, dir });
	return { requests, total, page, pageSize, q, sort: sort ?? null, dir };
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
