// The Delivery tab (/dashboard/[slug]/delivery) — what a leader lists as delivered
// under a SPECIFIC term (current or a past one from Elected experience). Distinct
// from a campaign RUN's forward-looking manifesto pillars (see the Campaign tab):
// this is retrospective, tied to `leaders.id`, not `campaigns.id`.
import { fail } from '@sveltejs/kit';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { deliveries, leaders, positions } from '$lib/server/db/schema';
import { requireLeader } from '$lib/server/dashboard';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { ctx } = await requireLeader(event);

	const termRows = await db
		.select({ id: leaders.id, status: leaders.status, positionTitle: positions.title, region: positions.region, from: leaders.startAt, to: leaders.endAt })
		.from(leaders)
		.innerJoin(positions, eq(leaders.positionId, positions.id))
		.where(and(eq(leaders.userId, ctx.profileUser.id), isNull(leaders.deletedAt)))
		.orderBy(desc(leaders.startAt));

	const termIds = termRows.map((t) => t.id);
	const deliveryRows = termIds.length
		? await db
				.select({ id: deliveries.id, leaderId: deliveries.leaderId, title: deliveries.title, description: deliveries.description })
				.from(deliveries)
				.where(and(inArray(deliveries.leaderId, termIds), isNull(deliveries.deletedAt)))
				.orderBy(asc(deliveries.createdAt))
		: [];

	return {
		terms: termRows.map((t) => ({
			id: t.id,
			label: `${t.positionTitle}, ${t.region}`,
			status: t.status,
			from: t.from.getFullYear(),
			to: t.to?.getFullYear() ?? null
		})),
		deliveries: deliveryRows
	};
};

type PendingDelivery = { leaderId: number; title: string; description: string };

export const actions: Actions = {
	save: async (event) => {
		const { ctx } = await requireLeader(event);
		const form = await event.request.formData();

		let pendingDeliveries: PendingDelivery[] = [];
		let removedDeliveryIds: number[] = [];
		try {
			pendingDeliveries = JSON.parse(String(form.get('deliveryEntries') ?? '[]'));
			removedDeliveryIds = JSON.parse(String(form.get('removedDeliveryIds') ?? '[]'));
		} catch {
			return fail(400, { error: 'Could not read the added delivery entries.' });
		}

		// Every referenced term must actually belong to this person — never trust a
		// leaderId straight off the client.
		const ownTermIds = new Set(
			(await db.select({ id: leaders.id }).from(leaders).where(and(eq(leaders.userId, ctx.profileUser.id), isNull(leaders.deletedAt)))).map((t) => t.id)
		);

		for (const d of pendingDeliveries) {
			if (!ownTermIds.has(d.leaderId)) return fail(400, { error: 'One of the added deliveries is attached to a term that isn\'t yours.' });
			if (!d.title?.trim()) return fail(400, { error: 'Every added delivery needs a title.' });
			if (d.description && d.description.trim().length > 1000) return fail(400, { error: 'Delivery descriptions are limited to 1000 characters.' });
		}

		for (const d of pendingDeliveries) {
			await db.insert(deliveries).values({
				leaderId: d.leaderId,
				title: d.title.trim(),
				description: d.description?.trim() || null
			});
		}

		if (removedDeliveryIds.length > 0) {
			// Scoped to this person's own terms so nobody can remove someone else's rows by id-guessing.
			await db
				.update(deliveries)
				.set({ deletedAt: new Date() })
				.where(and(inArray(deliveries.id, removedDeliveryIds), inArray(deliveries.leaderId, [...ownTermIds])));
		}

		return { saved: true };
	}
};
