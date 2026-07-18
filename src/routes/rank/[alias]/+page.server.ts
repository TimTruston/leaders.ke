import { redirect } from '@sveltejs/kit';
import { RANK_SLUG_ALIASES } from '$lib/utils/rankPositions';
import type { PageServerLoad } from './$types';

// Fallback for /rank/<anything> the canonical matcher didn't take: near-miss
// spellings (woman-rep(s), women-rep(s), the -representative variants) 301 to
// their canonical slug; every other unknown lands on the top of the hierarchy,
// same as /rank itself — never a dead end.
export const load: PageServerLoad = async ({ params }) => {
	const canonical = RANK_SLUG_ALIASES[params.alias];
	if (canonical) redirect(301, `/rank/${canonical}`);
	redirect(302, '/rank/presidents');
};
