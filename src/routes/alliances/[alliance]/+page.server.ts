import { error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { alliances, allianceMemberships, leaders, positions, users } from '$lib/server/db/schema';
import { fullName, leaderPath, slugify } from '$lib/server/leader';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const rows = await db.select().from(alliances).where(isNull(alliances.deletedAt));
	const alliance = rows.find((a) => slugify(a.title) === params.alliance);
	if (!alliance) error(404, 'Alliance not found');

	const memberRows = await db
		.select()
		.from(allianceMemberships)
		.innerJoin(leaders, eq(allianceMemberships.leaderId, leaders.id))
		.innerJoin(positions, eq(leaders.positionId, positions.id))
		.innerJoin(users, eq(leaders.userId, users.id))
		.where(
			and(
				eq(allianceMemberships.allianceId, alliance.id),
				isNull(allianceMemberships.deletedAt),
				isNull(allianceMemberships.to),
				isNull(leaders.deletedAt)
			)
		);

	return {
		alliance: { title: alliance.title, description: alliance.description },
		members: memberRows.map((r) => ({
			name: fullName(r.users),
			path: leaderPath(r.users),
			role: r.alliance_memberships.role,
			positionTitle: r.positions.title,
			region: r.positions.region
		}))
	};
};
