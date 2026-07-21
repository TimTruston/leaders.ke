import { requireAdmin } from '$lib/server/dashboard';
import { listProfiles } from '$lib/server/profiles';
import { getPageSize } from '$lib/server/settings';
import type { PageServerLoad } from './$types';

// Admin "Profiles" — one row per leader person, merging the old candidates /
// verifications / claims tabs. Search (`q`) spans name, slug, seat and manager.
export const load: PageServerLoad = async (event) => {
	await requireAdmin(event);
	const pageSize = await getPageSize();
	const params = event.url.searchParams;
	const page = Math.max(1, Number(params.get('page') ?? 1));
	const q = params.get('q') ?? '';
	const { profiles, total } = await listProfiles(page, pageSize, { q });
	return { profiles, total, page, pageSize, q };
};
