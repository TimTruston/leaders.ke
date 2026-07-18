import { error, redirect } from '@sveltejs/kit';
import { SINGULAR_POSITION_SLUGS } from '$lib/utils/seat';
import type { PageServerLoad } from './$types';

// Legacy Phase 1 URLs were region-first with singular positions
// (/nairobi/senator/edwin-sifuna). The taxonomy is position-first and plural
// (docs/URLDiscovery.md), so shared links 301 to /[position]/[region]/[leader].
// The position matcher keeps the new tree from ever landing here; this route
// only sees non-position first segments.
export const load: PageServerLoad = ({ params }) => {
	const plural = SINGULAR_POSITION_SLUGS[params.position];
	if (plural) {
		redirect(301, `/${plural}/${params.county}/${params.slug}`);
	}
	error(404, 'Not found');
};
