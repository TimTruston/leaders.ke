import { error } from '@sveltejs/kit';
import { eq, isNull, and } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { leaders, positions, users } from '$lib/server/db/schema';
import { fullName, slugify } from '$lib/server/leader';
import { loadSeatHub } from '$lib/server/seatHub';
import type { PageServerLoad } from './$types';

// /[position]: every region electing this role, linking into the regional
// hubs — except single-region national seats (President), which render the
// seat hub directly here instead of a one-item chooser (no /president/kenya).
export const load: PageServerLoad = async ({ params }) => {
	const positionRows = (await db.select().from(positions).where(isNull(positions.deletedAt))).filter(
		(p) => slugify(p.title) === params.position
	);
	if (positionRows.length === 0) error(404, 'Position not found');

	if (positionRows.length === 1) {
		const hub = await loadSeatHub(params.position, slugify(positionRows[0].region));
		if (!hub) error(404, 'Seat not found');
		return { hub };
	}

	const leaderRows = await db
		.select()
		.from(leaders)
		.innerJoin(positions, eq(leaders.positionId, positions.id))
		.innerJoin(users, eq(leaders.userId, users.id))
		.where(and(isNull(leaders.deletedAt)));

	const regions = positionRows
		.map((p) => {
			const seatLeaders = leaderRows.filter((r) => r.positions.id === p.id);
			const current = seatLeaders.find((r) => r.leaders.status === 'current');
			return {
				region: p.region,
				path: `/${params.position}/${slugify(p.region)}`,
				boundary: p.boundary,
				currentName: current ? fullName(current.users) : null,
				contestantCount: seatLeaders.filter((r) => r.leaders.status === 'aspirant').length
			};
		})
		.sort((a, b) => a.region.localeCompare(b.region));

	return {
		hub: null,
		positionTitle: positionRows[0].title,
		regions
	};
};
