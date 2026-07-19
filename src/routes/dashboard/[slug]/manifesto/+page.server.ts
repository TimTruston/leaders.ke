import { fail } from '@sveltejs/kit';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { pillars } from '$lib/server/db/schema';
import { requireLeader } from '$lib/server/dashboard';
import { fullName, getOrCreateRunCampaign, getRunCampaign } from '$lib/server/leader';
import { listTemplatesForLevel } from '$lib/server/adminPillars';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { ctx } = await requireLeader(event);
	// The manifesto belongs to the person's run this cycle (their 2027 campaign).
	const campaign = await getRunCampaign(ctx.profileUser.id);

	const pillarRows = campaign
		? await db
				.select()
				.from(pillars)
				.where(and(eq(pillars.campaignId, campaign.id), isNull(pillars.deletedAt)))
				.orderBy(asc(pillars.sortOrder), asc(pillars.id))
		: [];

	return {
		pillars: pillarRows.map((p) => ({
			id: p.id,
			title: p.title,
			summary: p.summary,
			deliveryStatus: p.deliveryStatus,
			evidence: p.evidence ?? ''
		})),
		templates: ctx.position ? await listTemplatesForLevel(ctx.position.title) : []
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

		const campaign = await getOrCreateRunCampaign(ctx.profileUser.id, ctx.position?.id ?? 0, domainUser.id, fullName(ctx.profileUser));

		const [last] = await db
			.select({ sortOrder: pillars.sortOrder })
			.from(pillars)
			.where(and(eq(pillars.campaignId, campaign.id), isNull(pillars.deletedAt)))
			.orderBy(desc(pillars.sortOrder))
			.limit(1);

		await db.insert(pillars).values({ campaignId: campaign.id, title, summary, sortOrder: (last?.sortOrder ?? -1) + 1 });
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

		const campaign = await getRunCampaign(ctx.profileUser.id);
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

		const campaign = await getRunCampaign(ctx.profileUser.id);
		if (!campaign) return fail(404, { error: 'No campaign yet.' });

		await db
			.update(pillars)
			.set({ deletedAt: new Date() })
			.where(and(eq(pillars.id, pillarId), eq(pillars.campaignId, campaign.id)));
		return { saved: true };
	},

	reorder: async (event) => {
		const { ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const orderedIds = String(form.get('order') ?? '')
			.split(',')
			.map(Number)
			.filter((n) => Number.isFinite(n) && n > 0);
		if (orderedIds.length === 0) return fail(400, { error: 'Invalid order.' });

		const campaign = await getRunCampaign(ctx.profileUser.id);
		if (!campaign) return fail(404, { error: 'No campaign yet.' });

		// Scoped to this campaign's own pillar ids, so a crafted id list from another
		// campaign can't smuggle in a sortOrder write here.
		const ownPillars = await db
			.select({ id: pillars.id })
			.from(pillars)
			.where(and(eq(pillars.campaignId, campaign.id), inArray(pillars.id, orderedIds), isNull(pillars.deletedAt)));
		const ownIds = new Set(ownPillars.map((p) => p.id));

		await Promise.all(
			orderedIds
				.filter((id) => ownIds.has(id))
				.map((id, sortOrder) =>
					db.update(pillars).set({ sortOrder }).where(and(eq(pillars.id, id), eq(pillars.campaignId, campaign.id)))
				)
		);
		return { saved: true };
	}
};
