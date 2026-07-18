import { getLeaderMetricsByPath, randomVerifiedAspirantPath } from '$lib/server/metrics';
import type { PageServerLoad } from './$types';

// /compare: side-by-side leader comparison. ?a=<path>&b=<path> select the two;
// the picker covers both blueprint modes (same seat across regions, same
// region across leaders/regimes) since any two leaders can be compared.
export const load: PageServerLoad = async ({ url }) => {
	// Only the two selected leaders are fetched (plus a slug lookup for the default
	// right side) — never the whole register, since the page only ever shows a pair.
	const a = url.searchParams.get('a') ?? '/edwin-sifuna';
	// Landing without a pair shows a live example instead of an empty page: the
	// right side is a random 2027 presidential aspirant, fresh on every visit.
	const b = url.searchParams.get('b') ?? (await randomVerifiedAspirantPath('President')) ?? '/william-ruto';

	const [left, right] = await Promise.all([getLeaderMetricsByPath(a), getLeaderMetricsByPath(b)]);
	return { left, right };
};
