import { error, redirect } from '@sveltejs/kit';
import { isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { positions } from '$lib/server/db/schema';
import { slugify } from '$lib/server/leader';
import { positionSlug, SINGULAR_POSITION_SLUGS } from '$lib/utils/seat';
import { loadSeatHub } from '$lib/server/seatHub';
import type { PageServerLoad } from './$types';

// Singular position URLs: a Country-wide seat has exactly one holder, so its
// singular (/president) IS the seat and renders the hub. Multi-region singulars
// (/governor) 301 to their plural directory (/governors).
export const load: PageServerLoad = async ({ params }) => {
	const plural = SINGULAR_POSITION_SLUGS[params.position];
	const positionRows = (await db.select().from(positions).where(isNull(positions.deletedAt))).filter(
		(p) => positionSlug(p.title) === plural
	);
	if (positionRows.length === 1) {
		const hub = await loadSeatHub(plural, slugify(positionRows[0].region));
		if (!hub) error(404, 'Seat not found');
		return { hub };
	}
	redirect(301, `/${plural}`);
};
