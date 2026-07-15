import { requireAdmin } from '$lib/server/dashboard';
import { listAccounts } from '$lib/server/accounts';
import { getPageSize } from '$lib/server/settings';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	await requireAdmin(event);
	const pageSize = await getPageSize();
	const page = Math.max(1, Number(event.url.searchParams.get('page') ?? 1));
	const { accounts, total } = await listAccounts(page, pageSize);
	return { accounts, total, page, pageSize };
};
