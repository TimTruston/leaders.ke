import { requireAdmin } from '$lib/server/dashboard';
import { listCandidates } from '$lib/server/candidates';
import { getPageSize } from '$lib/server/settings';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	await requireAdmin(event);
	const pageSize = await getPageSize();
	const page = Math.max(1, Number(event.url.searchParams.get('page') ?? 1));
	const { candidates, total } = await listCandidates(page, pageSize);
	return { candidates, total, page, pageSize };
};
