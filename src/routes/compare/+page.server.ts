import { listLeaderMetrics } from '$lib/server/metrics';
import type { PageServerLoad } from './$types';

// /compare: side-by-side leader comparison. ?a=<path>&b=<path> select the two;
// the picker covers both blueprint modes (same seat across regions, same
// region across leaders/regimes) since any two leaders can be compared.
export const load: PageServerLoad = async ({ url }) => {
	const metrics = await listLeaderMetrics();

	// Landing without a pair shows a live example instead of an empty page: the
	// right side is a random 2027 presidential aspirant, fresh on every visit.
	const aspirants = metrics.filter((m) => m.positionTitle === 'President' && m.status === 'aspirant');
	const randomAspirant = aspirants[Math.floor(Math.random() * aspirants.length)]?.path ?? '/william-ruto';
	const a = url.searchParams.get('a') ?? '/edwin-sifuna';
	const b = url.searchParams.get('b') ?? randomAspirant;

	// The picker is the quick-search (its own endpoint), so only the selected pair ships.
	return {
		left: metrics.find((m) => m.path === a) ?? null,
		right: metrics.find((m) => m.path === b) ?? null
	};
};
