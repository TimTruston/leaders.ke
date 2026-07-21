import { requireAdmin } from '$lib/server/dashboard';
import { listProfiles, type ProfileSort } from '$lib/server/profiles';
import { getPageSize } from '$lib/server/settings';
import type { PageServerLoad } from './$types';

const SORTS: ProfileSort[] = ['recent', 'name', 'position', 'region', 'status', 'source', 'verified'];

// Admin "Profiles" — one row per leader person, merging the old candidates /
// verifications / claims tabs. Search (`q`) spans name, slug, seat and manager;
// sort spans every visible column, default `recent` (newest activity first).
export const load: PageServerLoad = async (event) => {
	await requireAdmin(event);
	const pageSize = await getPageSize();
	const params = event.url.searchParams;
	const page = Math.max(1, Number(params.get('page') ?? 1));
	const q = params.get('q') ?? '';
	const sortParam = params.get('sort') ?? '';
	const sort: ProfileSort = SORTS.includes(sortParam as ProfileSort) ? (sortParam as ProfileSort) : 'recent';
	const dir = params.get('dir') === 'asc' ? 'asc' : params.get('dir') === 'desc' ? 'desc' : undefined;
	const { profiles, total } = await listProfiles(page, pageSize, { q, sort, dir });
	return { profiles, total, page, pageSize, q, sort, dir: dir ?? (sort === 'recent' ? 'desc' : 'asc') };
};
