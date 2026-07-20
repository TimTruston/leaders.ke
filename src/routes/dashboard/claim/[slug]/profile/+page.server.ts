// Claim-family Profile tab: same form as apply/campaign (ProfileTab), but saves
// stage into the pending claim's evidence — the public profile is untouched
// until an admin approves the claim.
import { fail } from '@sveltejs/kit';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { parties, partyMemberships, positions } from '$lib/server/db/schema';
import { deletePendingClaim, resolveClaimRequest, stageClaimEvidence, type ClaimEvidence } from '$lib/server/claims';
import { redirectWithFlash } from '$lib/server/flash';
import { saveLeaderDocument } from '$lib/server/storage';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { resolved, claim } = await resolveClaimRequest(event);
	const evidence = claim?.evidence as ClaimEvidence | null;
	const staged = evidence?.profile;
	// Only the claimant's own staged uploads — the profile's real documents must
	// never leak to someone merely attempting a claim.
	const stagedDocs = evidence?.documentation ?? {};

	const [positionRows, partyRows, currentMembership] = await Promise.all([
		db.select().from(positions).where(isNull(positions.deletedAt)).orderBy(asc(positions.title), asc(positions.region)),
		db.select({ id: parties.id, name: parties.name, abbreviation: parties.abbreviation }).from(parties).where(isNull(parties.deletedAt)).orderBy(asc(parties.name)),
		db
			.select({ partyId: partyMemberships.partyId })
			.from(partyMemberships)
			.where(and(eq(partyMemberships.subjectUserId, resolved.row.users.id), isNull(partyMemberships.deletedAt), isNull(partyMemberships.endAt)))
	]);

	return {
		positions: positionRows.map((p) => ({ id: p.id, title: p.title, region: p.region })),
		// A claim confirms identity + party; the Party select renders because parties
		// are provided. Experience editing belongs to the profile's team (hasLeader: false).
		parties: partyRows.map((p) => ({ id: p.id, name: p.abbreviation ? `${p.name} (${p.abbreviation})` : p.name })),
		existingExperience: [],
		existingLeadership: [],
		form: {
			firstName: staged?.firstName ?? resolved.row.users.firstName,
			otherNames: staged?.otherNames ?? resolved.row.users.otherNames,
			bio: staged?.bio ?? resolved.row.users.bio ?? '',
			partyId: staged?.partyId ?? currentMembership[0]?.partyId ?? null,
			slug: null,
			hasLeader: false,
			verified: false
		},
		// The real profile's current photo, unless the claimant has already staged
		// their own replacement — either way, never blank on first visit.
		photoUrl: stagedDocs.photoUrl ?? resolved.row.users.photoUrl ?? null,
		pendingVerification: false
	};
};

export const actions: Actions = {
	save: async (event) => {
		const { domainUser, resolved, claim } = await resolveClaimRequest(event);

		const form = await event.request.formData();
		const firstName = String(form.get('firstName') ?? '').trim();
		const otherNames = String(form.get('otherNames') ?? '').trim();
		const bio = String(form.get('bio') ?? '').trim();
		const partyId = Number(form.get('partyId') ?? 0) || null; // null = independent

		if (!firstName || /\s/.test(firstName)) {
			return fail(400, { error: 'First name is required and must be a single word.', missingFields: ['firstName'] });
		}
		if (!otherNames) return fail(400, { error: 'Other names are required.', missingFields: ['otherNames'] });
		if (!bio) return fail(400, { error: 'Add a short bio.', missingFields: ['bio'] });
		if (partyId) {
			const [party] = await db.select({ id: parties.id }).from(parties).where(and(eq(parties.id, partyId), isNull(parties.deletedAt)));
			if (!party) return fail(400, { error: 'That party does not exist.' });
		}

		// The photo rides this same submit but STAGES into the claim's evidence — the
		// file lands on disk (person-keyed), its URL is recorded on the pending claim
		// only, and the real users.photoUrl is untouched until an admin approves.
		const documentation = { ...((claim?.evidence as ClaimEvidence | null)?.documentation ?? {}) };
		const photoFile = form.get('photo');
		if (photoFile instanceof File && photoFile.size > 0) {
			try {
				documentation.photoUrl = await saveLeaderDocument(resolved.row.users.id, 'photo', photoFile);
			} catch (err) {
				return fail(400, { error: err instanceof Error ? err.message : 'Photo upload failed.' });
			}
		}

		await stageClaimEvidence(resolved.row.users.id, domainUser.id, {
			profile: { firstName, otherNames, bio, partyId },
			documentation
		});
		return { saved: true };
	},

	// The layout's claim widget posts here (like Submit Application in apply mode):
	// national ID + submittedAt mark the staged draft as ready for review. Nothing
	// is mailed to the leader here — an admin decides whether/where to send the
	// single-use approve/reject link (the queue's "Email the leader" action).
	submitClaim: async (event) => {
		const { domainUser, slug, resolved, claim } = await resolveClaimRequest(event);
		// The claimant's role + national ID come from the Signoff tab's staged details.
		const nationalId = (claim?.evidence as ClaimEvidence | null)?.signoff?.nationalId;
		if (!nationalId) return fail(400, { claimError: 'Complete the Signoff tab before submitting.' });

		await stageClaimEvidence(resolved.row.users.id, domainUser.id, {
			nationalId,
			submittedAt: new Date().toISOString()
		});

		redirectWithFlash(
			event.cookies,
			`/dashboard/claim/${slug}/profile`,
			'Claim submitted. An admin will review it and grant you manager access.'
		);
	},

	// "Just testing" escape hatch: drops the pending claim and everything staged in it.
	deleteClaim: async (event) => {
		const { domainUser, resolved } = await resolveClaimRequest(event);
		await deletePendingClaim(resolved.row.users.id, domainUser.id);
		redirectWithFlash(event.cookies, '/dashboard', 'Claim deleted.');
	}
};
