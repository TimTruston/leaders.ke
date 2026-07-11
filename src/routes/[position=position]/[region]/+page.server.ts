import { error } from '@sveltejs/kit';
import { loadSeatHub } from '$lib/server/seatHub';
import type { PageServerLoad } from './$types';

// /[position]/[region]: the seat's civic hub — current, 2027 contestants,
// and jump-offs to the history timeline and cycle grid. Voter counts,
// demographics and SRC compensation join once those datasets are seeded.
export const load: PageServerLoad = async ({ params }) => {
	const hub = await loadSeatHub(params.position, params.region);
	if (!hub) error(404, 'Seat not found');
	return hub;
};
