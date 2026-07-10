import { fail } from '@sveltejs/kit';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, pillars } from '$lib/server/db/schema';
import { requireLeader } from '$lib/server/dashboard';
import { fullName, getOrCreateMainCampaign } from '$lib/server/leader';
import type { Actions, PageServerLoad } from './$types';

async function getMainCampaign(leaderId: number) {
	const [c] = await db
		.select()
		.from(campaigns)
		.where(and(eq(campaigns.leaderId, leaderId), isNull(campaigns.parentCampaignId), isNull(campaigns.deletedAt)))
		.limit(1);
	return c;
}

export const load: PageServerLoad = async (event) => {
	const { ctx } = await requireLeader(event);
	const campaign = await getMainCampaign(ctx.leader.id);

	const pillarRows = campaign
		? await db
				.select()
				.from(pillars)
				.where(and(eq(pillars.campaignId, campaign.id), isNull(pillars.deletedAt)))
				.orderBy(asc(pillars.id))
		: [];

	return {
		pillars: pillarRows.map((p) => ({
			id: p.id,
			title: p.title,
			summary: p.summary,
			deliveryStatus: p.deliveryStatus,
			evidence: p.evidence ?? ''
		}))
	};
};

const DELIVERY_STATUSES = ['promised', 'in_progress', 'delivered'] as const;
type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const actions: Actions = {
	add: async (event) => {
		const { domainUser, ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const title = String(form.get('title') ?? '').trim();
		const summary = String(form.get('summary') ?? '').trim();
		if (!title || !summary) return fail(400, { error: 'A pillar needs both a title and a summary.' });

		const campaign = await getOrCreateMainCampaign(ctx.leader.id, domainUser.id, fullName(ctx.profileUser));
		await db.insert(pillars).values({ campaignId: campaign.id, title, summary });
		return { saved: true };
	},

	update: async (event) => {
		const { ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const pillarId = Number(form.get('pillarId') ?? 0);
		const title = String(form.get('title') ?? '').trim();
		const summary = String(form.get('summary') ?? '').trim();
		const deliveryStatus = String(form.get('deliveryStatus') ?? 'promised') as DeliveryStatus;
		const evidence = String(form.get('evidence') ?? '').trim();
		if (!title || !summary) return fail(400, { error: 'A pillar needs both a title and a summary.' });
		if (!DELIVERY_STATUSES.includes(deliveryStatus)) {
			return fail(400, { error: 'Invalid delivery status.' });
		}

		const campaign = await getMainCampaign(ctx.leader.id);
		if (!campaign) return fail(404, { error: 'No campaign yet.' });

		// Scope the update to this leader's campaign so ids can't cross leaders.
		await db
			.update(pillars)
			.set({ title, summary, deliveryStatus, evidence: evidence || null, updatedAt: new Date() })
			.where(and(eq(pillars.id, pillarId), eq(pillars.campaignId, campaign.id)));
		return { saved: true };
	},

	remove: async (event) => {
		const { ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const pillarId = Number(form.get('pillarId') ?? 0);

		const campaign = await getMainCampaign(ctx.leader.id);
		if (!campaign) return fail(404, { error: 'No campaign yet.' });

		await db
			.update(pillars)
			.set({ deletedAt: new Date() })
			.where(and(eq(pillars.id, pillarId), eq(pillars.campaignId, campaign.id)));
		return { saved: true };
	}
};
