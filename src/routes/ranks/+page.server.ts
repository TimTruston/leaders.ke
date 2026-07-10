import { listLeaderMetrics } from '$lib/server/metrics';
import type { PageServerLoad } from './$types';

// /ranks: public leader rankings by transparent engagement score.
export const load: PageServerLoad = async () => {
	const metrics = await listLeaderMetrics();
	return {
		leaders: metrics.map(({ pillars: _pillars, bio: _bio, ...rest }) => rest)
	};
};
