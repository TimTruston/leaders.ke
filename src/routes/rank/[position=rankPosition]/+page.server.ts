import { titleForRankSlug } from '$lib/utils/rankPositions';
import { listPositionMetrics } from '$lib/server/metrics';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 30;

// /rank/[position]: one position's ranking (plural slug, e.g. /rank/governors),
// paginated server-side so only the visible page's rows ship.
export const load: PageServerLoad = async ({ params, url, setHeaders }) => {
	// The matcher guarantees the slug maps; titleForRankSlug can't miss here.
	const title = titleForRankSlug(params.position)!;
	const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
	const { total, leaders } = await listPositionMetrics(title, page, PAGE_SIZE);

	// Browser-cache the page (and its __data.json) briefly, so pill hops back to an
	// already-seen position render from cache instead of re-scoring the register.
	setHeaders({ 'cache-control': 'private, max-age=60' });

	return { position: params.position, title, leaders, total, page, pageSize: PAGE_SIZE };
};
