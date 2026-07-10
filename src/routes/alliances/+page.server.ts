import { and, count, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { alliances, allianceMemberships } from '$lib/server/db/schema';
import { slugify } from '$lib/server/leader';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const rows = await db.select().from(alliances).where(isNull(alliances.deletedAt)).orderBy(alliances.title);

	const memberCounts = await db
		.select({ allianceId: allianceMemberships.allianceId, n: count() })
		.from(allianceMemberships)
		.where(and(isNull(allianceMemberships.deletedAt), isNull(allianceMemberships.to)))
		.groupBy(allianceMemberships.allianceId);
	const countByAllianceId = new Map(memberCounts.map((m) => [m.allianceId, m.n]));

	return {
		alliances: rows.map((a) => ({
			slug: slugify(a.title),
			title: a.title,
			description: a.description,
			memberCount: countByAllianceId.get(a.id) ?? 0
		}))
	};
};
