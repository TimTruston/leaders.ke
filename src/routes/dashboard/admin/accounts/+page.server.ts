import { requireAdmin } from '$lib/server/dashboard';
import { listAccounts } from '$lib/server/accounts';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 50;

export const load: PageServerLoad = async (event) => {
	await requireAdmin(event);
	const page = Math.max(1, Number(event.url.searchParams.get('page') ?? 1));
	const { accounts, total } = await listAccounts(page, PAGE_SIZE);
	return { accounts, total, page, pageSize: PAGE_SIZE };
};
