import { error, redirect } from '@sveltejs/kit';
import { loadSeatHub } from '$lib/server/seatHub';
import type { PageServerLoad } from './$types';

// /[position]/[region]/[year]: the same seat hub, scoped to one regime — the
// active cycle shows today's holder and the 2027 aspirants; a past year shows
// who held that cycle. Country-wide seats drop the region namespace, so their
// region-named form (/presidents/kenya/2027) 301s to /presidents/2027.
export const load: PageServerLoad = async ({ params }) => {
	const hub = await loadSeatHub(params.position, params.region, Number(params.year));
	if (!hub) error(404, 'Seat not found');
	if (hub.boundary === 'Country') redirect(301, `/${params.position}/${params.year}`);
	return { hub };
};
