import { error, redirect } from '@sveltejs/kit';
import { isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { positions } from '$lib/server/db/schema';
import { slugify } from '$lib/server/leader';
import { positionSlug } from '$lib/utils/seat';
import { loadSeatHub } from '$lib/server/seatHub';
import type { PageServerLoad } from './$types';

// /[position]/[region]: the seat's civic hub — current, 2027 contestants,
// and jump-offs to the history timeline and regime views. Country-wide seats
// have no region namespace: /presidents/2027 scopes the one seat by year, and
// the region-named forms (/presidents/kenya) 301 to the singular hub.
export const load: PageServerLoad = async ({ params }) => {
	// A year in the region slot (/presidents/2027): the Country seat's regime page.
	if (/^\d{4}$/.test(params.region)) {
		const [row] = (await db.select().from(positions).where(isNull(positions.deletedAt))).filter(
			(p) => positionSlug(p.title) === params.position && p.boundary === 'Country'
		);
		if (!row) error(404, 'Seat not found');
		const hub = await loadSeatHub(params.position, slugify(row.region), Number(params.region));
		if (!hub) error(404, 'Seat not found');
		return hub;
	}

	const hub = await loadSeatHub(params.position, params.region);
	if (!hub) error(404, 'Seat not found');
	if (hub.boundary === 'Country') redirect(301, hub.hubPath);
	return hub;
};
