import { error } from '@sveltejs/kit';
import { loadSeatHub } from '$lib/server/seatHub';
import type { PageServerLoad } from './$types';

// /[position]/[region]/[year]: the same seat hub, scoped to one regime — the
// active cycle shows today's holder and the 2027 aspirants; a past year shows
// who held and won that cycle. The hub's regime line navigates between years.
export const load: PageServerLoad = async ({ params }) => {
	const hub = await loadSeatHub(params.position, params.region, Number(params.year));
	if (!hub) error(404, 'Seat not found');
	return { hub };
};
