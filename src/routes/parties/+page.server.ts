import { and, isNull, isNotNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, leaders, parties } from '$lib/server/db/schema';
import { slugify } from '$lib/server/leader';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const rows = await db.select().from(parties).where(isNull(parties.deletedAt)).orderBy(parties.name);

	// Members: distinct people with a live term or run recording this party
	// (partyId is per-term/per-run, not a person-level fact — see leaders.partyId).
	const [termRows, runRows] = await Promise.all([
		db.select({ partyId: leaders.partyId, userId: leaders.userId }).from(leaders).where(and(isNull(leaders.deletedAt), isNotNull(leaders.partyId))),
		db
			.select({ partyId: campaigns.partyId, userId: campaigns.subjectUserId })
			.from(campaigns)
			.where(and(isNull(campaigns.deletedAt), isNull(campaigns.parentCampaignId), isNotNull(campaigns.partyId)))
	]);
	const membersByPartyId = new Map<number, Set<number>>();
	for (const r of [...termRows, ...runRows]) {
		if (!r.partyId) continue;
		const set = membersByPartyId.get(r.partyId) ?? new Set<number>();
		set.add(r.userId);
		membersByPartyId.set(r.partyId, set);
	}
	const countByPartyId = new Map([...membersByPartyId.entries()].map(([partyId, users]) => [partyId, users.size]));

	return {
		parties: rows.map((p) => ({
			id: p.id,
			slug: slugify(p.name),
			name: p.name,
			abbreviation: p.abbreviation,
			logo: p.logo,
			status: p.status,
			createdAt: p.createdAt.toISOString(),
			certifiedAt: p.certifiedAt ? p.certifiedAt.toISOString() : null,
			verifiedAt: p.verifiedAt ? p.verifiedAt.toISOString() : null,
			memberCount: countByPartyId.get(p.id) ?? 0
		}))
	};
};
