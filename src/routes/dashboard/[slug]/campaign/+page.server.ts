// Campaign tab: a person may run zero, one, or (across different election years)
// two campaigns — DB-enforced at most one per person per cycle year — each fully
// independent: its own seat, platform, IEBC certificate, manifesto pillars, and
// verification. "Add Campaign" creates a new one; ?campaign=<id> picks which
// existing one is open, defaulting to the first. Reachable once a profile is saved.
import { fail } from '@sveltejs/kit';
import { and, asc, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, parties, pillars, positions } from '$lib/server/db/schema';
import { requireLeader } from '$lib/server/dashboard';
import { ACTIVE_CYCLE, resolveOtherParty } from '$lib/server/leader';
import { listTemplatesForLevel } from '$lib/server/adminPillars';
import { saveLeaderDocument } from '$lib/server/storage';
import type { Actions, PageServerLoad } from './$types';

// Cycle options: the active election year and the next one — a person can have
// at most one campaign per year (DB-enforced), so at most 2 campaigns ever.
const CYCLES = [ACTIVE_CYCLE, ACTIVE_CYCLE + 5];

export const load: PageServerLoad = async (event) => {
	const { ctx, domainUser } = await requireLeader(event);

	const ownCampaigns = await db
		.select()
		.from(campaigns)
		.where(and(eq(campaigns.subjectUserId, ctx.profileUser.id), isNull(campaigns.parentCampaignId), isNull(campaigns.deletedAt)))
		.orderBy(asc(campaigns.id));

	// Which tab is open: ?campaign=<id> if it's one of theirs, else the first
	// existing campaign, else none (the empty "Add Campaign" state).
	const requestedId = Number(event.url.searchParams.get('campaign') ?? 0);
	const selected = ownCampaigns.find((c) => c.id === requestedId) ?? ownCampaigns[0] ?? null;

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
		selected
			? db
					.select()
					.from(pillars)
					.where(and(eq(pillars.campaignId, selected.id), isNull(pillars.deletedAt)))
					.orderBy(asc(pillars.sortOrder), asc(pillars.id))
			: Promise.resolve([])
	]);

	// Two different "available years" lists: editing the currently open campaign
	// still offers its OWN year (excluded from "taken"); a brand new campaign
	// can't reuse any year this person already has, full stop.
	const allTakenYears = new Set(ownCampaigns.map((c) => c.cycleYear));
	const takenYearsExcludingSelected = new Set(ownCampaigns.filter((c) => c.id !== selected?.id).map((c) => c.cycleYear));

	return {
		isAdmin: !!domainUser.adminAt,
		profileId: ctx.profileUser.id,
		positions: positionRows,
		parties: partyRows.map((p) => ({ id: p.id, name: p.abbreviation ? `${p.name} (${p.abbreviation})` : p.name })),
		cycles: CYCLES.filter((y) => !takenYearsExcludingSelected.has(y)),
		newCampaignCycles: CYCLES.filter((y) => !allTakenYears.has(y)),
		canAddCampaign: ownCampaigns.length < CYCLES.length,
		campaigns: ownCampaigns.map((c, i) => ({ id: c.id, label: `${c.cycleYear} #${i + 1}`, verified: !!c.verifiedAt })),
		selectedId: selected?.id ?? null,
		campaign: selected
			? {
					id: selected.id,
					title: selected.title,
					positionId: selected.positionId,
					cycleYear: selected.cycleYear,
					description: selected.description,
					iebcCertificateUrl: selected.iebcCertificateUrl,
					// Party is per-run (campaigns.partyId), not a person-level fact — a
					// person can contest under a different party than the one they held
					// their last term under.
					partyId: selected.partyId,
					verified: !!selected.verifiedAt
				}
			: null,
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
		const campaignId = Number(form.get('campaignId') ?? 0); // 0 = create a new campaign
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

		// One campaign per person per cycle year is DB-enforced; check first for a
		// clean error instead of a raw constraint violation.
		const [dup] = await db
			.select({ id: campaigns.id })
			.from(campaigns)
			.where(
				and(
					eq(campaigns.subjectUserId, ctx.profileUser.id),
					eq(campaigns.cycleYear, cycleYear),
					isNull(campaigns.parentCampaignId),
					isNull(campaigns.deletedAt),
					campaignId ? ne(campaigns.id, campaignId) : undefined
				)
			);
		if (dup) return fail(400, { error: `You already have a campaign for ${cycleYear}.`, missingFields: ['cycleYear'] });

		// The IEBC certificate (PDF) rides this submit; validate before any write.
		const cert = form.get('iebc-certificate');
		const hasCert = cert instanceof File && cert.size > 0;
		if (hasCert) {
			if (cert.size > 10 * 1024 * 1024) return fail(400, { error: 'The certificate is larger than 10 MB.' });
			if (cert.type !== 'application/pdf') return fail(400, { error: 'The IEBC certificate must be a PDF.' });
		}
		let iebcCertificateUrl: string | undefined;
		if (hasCert) {
			try {
				iebcCertificateUrl = await saveLeaderDocument(ctx.profileUser.id, 'iebc-certificate', cert);
			} catch (err) {
				return fail(400, { error: err instanceof Error ? err.message : 'Certificate upload failed.' });
			}
		}

		let savedId: number;
		if (campaignId) {
			const [existing] = await db
				.select({ id: campaigns.id, verifiedAt: campaigns.verifiedAt })
				.from(campaigns)
				.where(and(eq(campaigns.id, campaignId), eq(campaigns.subjectUserId, ctx.profileUser.id), isNull(campaigns.deletedAt)));
			if (!existing) return fail(404, { error: 'Campaign not found.' });

			// A verified campaign keeps its seat/cycle (it's public/on the ballot);
			// only its title/platform/party/certificate change.
			const updates: Record<string, unknown> = { title, description, partyId, updatedAt: new Date() };
			if (!existing.verifiedAt) {
				updates.positionId = positionId;
				updates.cycleYear = cycleYear;
			}
			if (iebcCertificateUrl) updates.iebcCertificateUrl = iebcCertificateUrl;
			await db.update(campaigns).set(updates).where(eq(campaigns.id, existing.id));
			savedId = existing.id;
		} else {
			const [created] = await db
				.insert(campaigns)
				.values({
					creatorId: ctx.profileUser.id,
					subjectUserId: ctx.profileUser.id,
					positionId,
					cycleYear,
					partyId,
					title,
					description,
					iebcCertificateUrl
				})
				.returning({ id: campaigns.id });
			savedId = created.id;
		}

		return { saved: true, campaignId: savedId };
	},

	addPillar: async (event) => {
		const { ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const campaignId = Number(form.get('campaignId') ?? 0);
		const title = String(form.get('title') ?? '').trim();
		const summary = String(form.get('summary') ?? '').trim();
		if (!title || !summary) return fail(400, { error: 'A pillar needs both a title and a summary.' });

		const [campaign] = await db
			.select({ id: campaigns.id })
			.from(campaigns)
			.where(and(eq(campaigns.id, campaignId), eq(campaigns.subjectUserId, ctx.profileUser.id), isNull(campaigns.deletedAt)));
		if (!campaign) return fail(404, { error: 'Campaign not found.' });

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
		const campaignId = Number(form.get('campaignId') ?? 0);
		const pillarId = Number(form.get('pillarId') ?? 0);
		const title = String(form.get('title') ?? '').trim();
		const summary = String(form.get('summary') ?? '').trim();
		const deliveryStatus = String(form.get('deliveryStatus') ?? 'promised') as DeliveryStatus;
		const evidence = String(form.get('evidence') ?? '').trim();
		if (!title || !summary) return fail(400, { error: 'A pillar needs both a title and a summary.' });
		if (!DELIVERY_STATUSES.includes(deliveryStatus)) {
			return fail(400, { error: 'Invalid delivery status.' });
		}

		const [campaign] = await db
			.select({ id: campaigns.id })
			.from(campaigns)
			.where(and(eq(campaigns.id, campaignId), eq(campaigns.subjectUserId, ctx.profileUser.id), isNull(campaigns.deletedAt)));
		if (!campaign) return fail(404, { error: 'Campaign not found.' });

		// Scope the update to this campaign so ids can't cross campaigns/leaders.
		await db
			.update(pillars)
			.set({ title, summary, deliveryStatus, evidence: evidence || null, updatedAt: new Date() })
			.where(and(eq(pillars.id, pillarId), eq(pillars.campaignId, campaign.id)));
		return { saved: true };
	},

	removePillar: async (event) => {
		const { ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const campaignId = Number(form.get('campaignId') ?? 0);
		const pillarId = Number(form.get('pillarId') ?? 0);

		const [campaign] = await db
			.select({ id: campaigns.id })
			.from(campaigns)
			.where(and(eq(campaigns.id, campaignId), eq(campaigns.subjectUserId, ctx.profileUser.id), isNull(campaigns.deletedAt)));
		if (!campaign) return fail(404, { error: 'Campaign not found.' });

		await db
			.update(pillars)
			.set({ deletedAt: new Date() })
			.where(and(eq(pillars.id, pillarId), eq(pillars.campaignId, campaign.id)));
		return { saved: true };
	},

	reorderPillars: async (event) => {
		const { ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const campaignId = Number(form.get('campaignId') ?? 0);
		const orderedIds = String(form.get('order') ?? '')
			.split(',')
			.map(Number)
			.filter((n) => Number.isFinite(n) && n > 0);
		if (orderedIds.length === 0) return fail(400, { error: 'Invalid order.' });

		const [campaign] = await db
			.select({ id: campaigns.id })
			.from(campaigns)
			.where(and(eq(campaigns.id, campaignId), eq(campaigns.subjectUserId, ctx.profileUser.id), isNull(campaigns.deletedAt)));
		if (!campaign) return fail(404, { error: 'Campaign not found.' });

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
