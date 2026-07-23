import { fail } from '@sveltejs/kit';
import { and, eq, isNull, isNotNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, leaders, parties } from '$lib/server/db/schema';
import { requireAdmin } from '$lib/server/dashboard';
import { slugify } from '$lib/server/leader';
import type { Actions, PageServerLoad } from './$types';

// Admin roster for the parties.verifiedAt badge: confirms the party's ORPP
// listing (name/symbol/colors/status) was manually checked against the
// register. A badge only (see docs/URLDiscovery.md) — never a visibility gate.
export const load: PageServerLoad = async (event) => {
	await requireAdmin(event);
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

export const actions: Actions = {
	verify: async (event) => {
		await requireAdmin(event);
		const form = await event.request.formData();
		const id = Number(form.get('partyId') ?? 0);
		if (!id) return fail(400, { error: 'Party not found.' });
		await db.update(parties).set({ verifiedAt: new Date() }).where(eq(parties.id, id));
		return { saved: true };
	},
	unverify: async (event) => {
		await requireAdmin(event);
		const form = await event.request.formData();
		const id = Number(form.get('partyId') ?? 0);
		if (!id) return fail(400, { error: 'Party not found.' });
		await db.update(parties).set({ verifiedAt: null }).where(eq(parties.id, id));
		return { saved: true };
	}
};
