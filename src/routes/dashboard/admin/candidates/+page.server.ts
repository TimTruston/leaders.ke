import { requireAdmin } from '$lib/server/dashboard';
import { listCandidates } from '$lib/server/candidates';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 50;

export const load: PageServerLoad = async (event) => {
	await requireAdmin(event);
	const page = Math.max(1, Number(event.url.searchParams.get('page') ?? 1));
	const { candidates, total } = await listCandidates(page, PAGE_SIZE);
	return { candidates, total, page, pageSize: PAGE_SIZE };
};
