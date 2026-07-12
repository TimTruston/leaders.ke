import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { parties, partyMemberships } from '$lib/server/db/schema';
import { slugify } from '$lib/server/leader';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const rows = await db.select().from(parties).where(isNull(parties.deletedAt)).orderBy(parties.name);

	const memberCounts = await db
		.select({ partyId: partyMemberships.partyId, n: count() })
		.from(partyMemberships)
		.where(and(isNull(partyMemberships.deletedAt), isNull(partyMemberships.endAt)))
		.groupBy(partyMemberships.partyId);
	const countByPartyId = new Map(memberCounts.map((m) => [m.partyId, m.n]));

	return {
		parties: rows.map((p) => ({
			slug: slugify(p.name),
			name: p.name,
			abbreviation: p.abbreviation,
			symbol: p.symbol,
			colors: p.colors,
			status: p.status,
			memberCount: countByPartyId.get(p.id) ?? 0
		}))
	};
};
