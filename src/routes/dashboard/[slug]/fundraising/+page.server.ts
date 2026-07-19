import { fail } from '@sveltejs/kit';
import { and, desc, eq, isNull, sum } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, donations } from '$lib/server/db/schema';
import { requireLeader } from '$lib/server/dashboard';
import { fullName, getOrCreateRunCampaign } from '$lib/server/leader';
import type { Actions, PageServerLoad } from './$types';

// Fundraising desk: goal + donation ledger. Donations arrive from the public
// campaign page as 'pending' (donor sends via M-Pesa manually) and the team
// confirms against their statement; the Daraja STK-push flow automates this later.
export const load: PageServerLoad = async (event) => {
	const { ctx } = await requireLeader(event);

	// Fundraising belongs to the run: goal + ledger live on the main campaign.
	const campaign = await getOrCreateRunCampaign(ctx.profileUser.id, ctx.position.id, ctx.profileUser.id, fullName(ctx.profileUser));
	const scope = and(eq(donations.campaignId, campaign.id), isNull(donations.deletedAt));

	const [rows, [confirmedRow]] = await Promise.all([
		db.select().from(donations).where(scope).orderBy(desc(donations.createdAt)),
		db
			.select({ total: sum(donations.amount) })
			.from(donations)
			.where(and(scope, eq(donations.status, 'confirmed')))
	]);

	return {
		goal: campaign.fundraisingGoal,
		raised: Number(confirmedRow.total ?? 0),
		donations: rows.map((d) => ({
			id: d.id,
			donorName: d.donorName,
			phoneNumber: d.phoneNumber,
			amount: d.amount,
			status: d.status,
			reference: d.reference,
			createdAt: d.createdAt.toISOString()
		}))
	};
};

export const actions: Actions = {
	setGoal: async (event) => {
		const { ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const goal = Number(form.get('goal') ?? 0);
		if (!Number.isFinite(goal) || goal < 0) return fail(400, { error: 'Enter a valid goal in KES.' });

		const campaign = await getOrCreateRunCampaign(ctx.profileUser.id, ctx.position.id, ctx.profileUser.id, fullName(ctx.profileUser));
		await db
			.update(campaigns)
			.set({ fundraisingGoal: Math.round(goal), updatedAt: new Date() })
			.where(eq(campaigns.id, campaign.id));
		return { saved: true };
	},

	confirm: async (event) => {
		const { ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const donationId = Number(form.get('donationId') ?? 0);
		const reference = String(form.get('reference') ?? '').trim();

		const campaign = await getOrCreateRunCampaign(ctx.profileUser.id, ctx.position.id, ctx.profileUser.id, fullName(ctx.profileUser));
		await db
			.update(donations)
			.set({ status: 'confirmed', reference: reference || null, updatedAt: new Date() })
			.where(and(eq(donations.id, donationId), eq(donations.campaignId, campaign.id)));
		return { saved: true };
	},

	markFailed: async (event) => {
		const { ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const donationId = Number(form.get('donationId') ?? 0);

		const campaign = await getOrCreateRunCampaign(ctx.profileUser.id, ctx.position.id, ctx.profileUser.id, fullName(ctx.profileUser));
		await db
			.update(donations)
			.set({ status: 'failed', updatedAt: new Date() })
			.where(and(eq(donations.id, donationId), eq(donations.campaignId, campaign.id)));
		return { saved: true };
	}
};
