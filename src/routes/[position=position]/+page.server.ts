import { error } from '@sveltejs/kit';
import { isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { positions } from '$lib/server/db/schema';
import { positionSlug } from '$lib/utils/seat';
import { listPositionDirectory } from '$lib/server/directory';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 30;

// /[position] (plural, e.g. /governors): the position's directory — the old
// /leaders grid, one position per page, filterable and server-paginated. The
// seat hubs live at /[position]/[region] (and /president for Country seats).
export const load: PageServerLoad = async ({ params, url, setHeaders }) => {
	const positionRows = (await db.select().from(positions).where(isNull(positions.deletedAt))).filter(
		(p) => positionSlug(p.title) === params.position
	);
	if (positionRows.length === 0) error(404, 'Position not found');
	const positionTitle = positionRows[0].title;

	// Directory filters ride the URL so pages are shareable and back/forward-safe.
	const rawStatus = url.searchParams.get('status') ?? '';
	const filters = {
		region: url.searchParams.get('region') ?? '',
		party: url.searchParams.get('party') ?? '',
		status: (rawStatus === 'current' || rawStatus === 'aspirant' ? rawStatus : '') as '' | 'current' | 'aspirant',
		q: url.searchParams.get('q') ?? '',
		page: Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1)
	};
	const directory = await listPositionDirectory(positionTitle, {
		page: filters.page,
		pageSize: PAGE_SIZE,
		region: filters.region,
		party: filters.party,
		status: filters.status,
		query: filters.q
	});

	// Browser-cache briefly so pill hops back to a seen position render from cache.
	setHeaders({ 'cache-control': 'private, max-age=60' });

	return { positionTitle, directory, filters, pageSize: PAGE_SIZE };
};
