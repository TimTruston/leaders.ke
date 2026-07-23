import { fail } from '@sveltejs/kit';
import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { parties, partyMemberships } from '$lib/server/db/schema';
import { requireAdmin } from '$lib/server/dashboard';
import { slugify } from '$lib/server/leader';
import type { Actions, PageServerLoad } from './$types';

// Admin roster for the parties.verifiedAt badge: confirms the party's ORPP
// listing (name/symbol/colors/status) was manually checked against the
// register. A badge only (see docs/URLDiscovery.md) — never a visibility gate.
export const load: PageServerLoad = async (event) => {
	await requireAdmin(event);
	const rows = await db.select().from(parties).where(isNull(parties.deletedAt)).orderBy(parties.name);

	const memberCounts = await db
		.select({ partyId: partyMemberships.partyId, n: count() })
		.from(partyMemberships)
		.where(and(isNull(partyMemberships.deletedAt), isNull(partyMemberships.endAt)))
		.groupBy(partyMemberships.partyId);
	const countByPartyId = new Map(memberCounts.map((m) => [m.partyId, m.n]));

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
