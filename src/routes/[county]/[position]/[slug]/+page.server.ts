import { error, redirect } from '@sveltejs/kit';
import { POSITION_SLUGS } from '../../../../params/position';
import type { PageServerLoad } from './$types';

// Legacy Phase 1 URLs were region-first (/nairobi/senator/edwin-sifuna).
// The taxonomy is position-first (docs/URLDiscovery.md), so shared links
// 301 to /[position]/[region]/[leader]. The position matcher keeps the new
// tree from ever landing here; this route only sees non-position first segments.
export const load: PageServerLoad = ({ params }) => {
	if ((POSITION_SLUGS as readonly string[]).includes(params.position)) {
		redirect(301, `/${params.position}/${params.county}/${params.slug}`);
	}
	error(404, 'Not found');
};
