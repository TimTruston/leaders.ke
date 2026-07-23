// Campaign tab: the RUN itself — seat contested (position), cycle year, manifesto
// title + rich-text description, and the IEBC nomination certificate. One run per
// person per cycle (getOrCreateRunCampaign). Reachable once a profile is saved.
import { fail } from '@sveltejs/kit';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, parties, positions } from '$lib/server/db/schema';
import { requireLeader } from '$lib/server/dashboard';
import { ACTIVE_CYCLE, fullName, getOrCreateRunCampaign, getRunCampaign, resolveOtherParty } from '$lib/server/leader';
import { saveLeaderDocument } from '$lib/server/storage';
import type { Actions, PageServerLoad } from './$types';

// Cycle options: the active election year and the next one (a run is always future).
const CYCLES = [ACTIVE_CYCLE, ACTIVE_CYCLE + 5];

export const load: PageServerLoad = async (event) => {
	const { ctx } = await requireLeader(event);
	const run = await getRunCampaign(ctx.profileUser.id);

	const [positionRows, partyRows] = await Promise.all([
		db
			.select({ id: positions.id, title: positions.title, region: positions.region })
			.from(positions)
			.where(isNull(positions.deletedAt))
			.orderBy(asc(positions.title), asc(positions.region)),
		db
			.select({ id: parties.id, name: parties.name, abbreviation: parties.abbreviation })
			.from(parties)
			.where(isNull(parties.deletedAt))
			.orderBy(asc(parties.name))
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
		}
	};
};

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
	}
};
