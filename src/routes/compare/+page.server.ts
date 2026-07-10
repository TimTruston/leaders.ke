import { listLeaderMetrics } from '$lib/server/metrics';
import type { PageServerLoad } from './$types';

// /compare: side-by-side leader comparison. ?a=<path>&b=<path> select the two;
// the picker covers both blueprint modes (same seat across regions, same
// region across leaders/regimes) since any two leaders can be compared.
export const load: PageServerLoad = async ({ url }) => {
	const metrics = await listLeaderMetrics();

	const a = url.searchParams.get('a');
	const b = url.searchParams.get('b');

	return {
		options: metrics.map((m) => ({
			path: m.path,
			label: `${m.name} (${m.positionTitle}, ${m.regionLabel})`
		})),
		left: metrics.find((m) => m.path === a) ?? null,
		right: metrics.find((m) => m.path === b) ?? null
	};
};
