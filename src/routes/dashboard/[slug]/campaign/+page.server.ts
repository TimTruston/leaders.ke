// Campaign tab: the RUN itself — seat contested (position), cycle year, manifesto
// title + rich-text description, the IEBC nomination certificate, and the manifesto
// pillars (the itemized, trackable promises). One run per person per cycle
// (getOrCreateRunCampaign). Reachable once a profile is saved.
import { fail } from '@sveltejs/kit';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, parties, pillars, positions } from '$lib/server/db/schema';
import { requireLeader } from '$lib/server/dashboard';
import { ACTIVE_CYCLE, fullName, getOrCreateRunCampaign, getRunCampaign, resolveOtherParty } from '$lib/server/leader';
import { listTemplatesForLevel } from '$lib/server/adminPillars';
import { saveLeaderDocument } from '$lib/server/storage';
import type { Actions, PageServerLoad } from './$types';

// Cycle options: the active election year and the next one (a run is always future).
const CYCLES = [ACTIVE_CYCLE, ACTIVE_CYCLE + 5];

export const load: PageServerLoad = async (event) => {
	const { ctx } = await requireLeader(event);
	const run = await getRunCampaign(ctx.profileUser.id);

	const [positionRows, partyRows, pillarRows] = await Promise.all([
		db
			.select({ id: positions.id, title: positions.title, region: positions.region })
			.from(positions)
			.where(isNull(positions.deletedAt))
			.orderBy(asc(positions.title), asc(positions.region)),
		db
			.select({ id: parties.id, name: parties.name, abbreviation: parties.abbreviation })
			.from(parties)
			.where(isNull(parties.deletedAt))
			.orderBy(asc(parties.name)),
		// The manifesto belongs to the person's run this cycle (their 2027 campaign).
		run
			? db
					.select()
					.from(pillars)
					.where(and(eq(pillars.campaignId, run.id), isNull(pillars.deletedAt)))
					.orderBy(asc(pillars.sortOrder), asc(pillars.id))
			: Promise.resolve([])
	]);

	return {
		positions: positionRows,
		parties: partyRows.map((p) => ({ id: p.id, name: p.abbreviation ? `${p.name} (${p.abbreviation})` : p.name })),
		cycles: CYCLES,
		campaign: {
			title: run?.title ?? '',
			positionId: run?.positionId ?? ctx.position?.id ?? null,
			cycleYear: run?.cycleYear ?? ACTIVE_CYCLE,
			description: run?.description ?? '',
			iebcCertificateUrl: run?.iebcCertificateUrl ?? null,
			// Party is per-run (campaigns.partyId), not a person-level fact — a
			// person can contest under a different party than the one they held
			// their last term under.
			partyId: run?.partyId ?? null,
			verified: !!run?.verifiedAt
		},
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
	save: async (event) => {
		const { ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const title = String(form.get('title') ?? '').trim();
		const description = String(form.get('description') ?? '').trim();
		const positionId = Number(form.get('positionId') ?? 0);
		const cycleYear = Number(form.get('cycleYear') ?? 0);
		const partyRaw = String(form.get('partyId') ?? '').trim();
		const partyOtherRaw = String(form.get('partyOther') ?? '').trim();

		if (!title) return fail(400, { error: 'Give your campaign a title.', missingFields: ['title'] });
		if (!positionId) return fail(400, { error: 'Pick the seat you are contesting.', missingFields: ['positionId'] });
		if (!CYCLES.includes(cycleYear)) return fail(400, { error: 'Pick a valid election cycle.', missingFields: ['cycleYear'] });
		if (!description) return fail(400, { error: 'Describe your campaign.', missingFields: ['description'] });
		if (partyRaw === 'other' && !partyOtherRaw) return fail(400, { error: 'Enter the party name.' });

		const [position] = await db
			.select({ id: positions.id })
			.from(positions)
			.where(and(eq(positions.id, positionId), isNull(positions.deletedAt)));
		if (!position) return fail(400, { error: 'That seat does not exist.', missingFields: ['positionId'] });

		let partyId = partyRaw && partyRaw !== 'other' ? Number(partyRaw) || null : null; // null = independent
		if (partyId) {
			const [party] = await db.select({ id: parties.id }).from(parties).where(and(eq(parties.id, partyId), isNull(parties.deletedAt)));
			if (!party) return fail(400, { error: 'That party does not exist.' });
		} else if (partyRaw === 'other') {
			partyId = await resolveOtherParty(partyOtherRaw);
		}

		// The IEBC certificate (PDF) rides this submit; validate before any write.
		const cert = form.get('iebc-certificate');
		const hasCert = cert instanceof File && cert.size > 0;
		if (hasCert) {
			if (cert.size > 10 * 1024 * 1024) return fail(400, { error: 'The certificate is larger than 10 MB.' });
			if (cert.type !== 'application/pdf') return fail(400, { error: 'The IEBC certificate must be a PDF.' });
		}

		// Find-or-create the person's run, then set its seat/cycle/manifesto. A verified
		// run keeps its seat (it's public/on the ballot); only its title/description change.
		const run = await getOrCreateRunCampaign(ctx.profileUser.id, positionId, ctx.profileUser.id, fullName(ctx.profileUser));
		const updates: Record<string, unknown> = { title, description, partyId, updatedAt: new Date() };
		if (!run.verifiedAt) {
			updates.positionId = positionId;
			updates.cycleYear = cycleYear;
		}
		if (hasCert) {
			try {
				updates.iebcCertificateUrl = await saveLeaderDocument(ctx.profileUser.id, 'iebc-certificate', cert);
			} catch (err) {
				return fail(400, { error: err instanceof Error ? err.message : 'Certificate upload failed.' });
			}
		}
		await db.update(campaigns).set(updates).where(eq(campaigns.id, run.id));

		return { saved: true };
	},

	addPillar: async (event) => {
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

	updatePillar: async (event) => {
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

	removePillar: async (event) => {
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

	reorderPillars: async (event) => {
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
