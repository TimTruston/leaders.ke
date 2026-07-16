// Claim-family Profile tab: same form as apply/campaign (ProfileTab), but saves
// stage into the pending claim's evidence — the public profile is untouched
// until an admin approves the claim.
import { randomBytes } from 'node:crypto';
import { fail } from '@sveltejs/kit';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { contacts, positions } from '$lib/server/db/schema';
import { deletePendingClaim, resolveClaimRequest, stageClaimEvidence, type ClaimEvidence } from '$lib/server/claims';
import { sendEmail } from '$lib/server/email';
import { fullName } from '$lib/server/leader';
import { redirectWithFlash } from '$lib/server/flash';
import { saveLeaderDocument, type UploadKind } from '$lib/server/storage';
import type { Actions, PageServerLoad } from './$types';

// The campaign documents the Profile tab uploads — staged into the claim's
// evidence, never onto the real leaders row (the claimant isn't the owner yet).
const DOC_KEY_BY_KIND = { photo: 'photoUrl', 'iebc-certificate': 'iebcCertificateUrl' } as const;

export const load: PageServerLoad = async (event) => {
	const { resolved, claim } = await resolveClaimRequest(event);
	const evidence = claim?.evidence as ClaimEvidence | null;
	const staged = evidence?.profile;
	// Only the claimant's own staged uploads — the profile's real documents must
	// never leak to someone merely attempting a claim.
	const stagedDocs = evidence?.documentation ?? {};

	const positionRows = await db
		.select()
		.from(positions)
		.where(isNull(positions.deletedAt))
		.orderBy(asc(positions.title), asc(positions.region));

	return {
		positions: positionRows.map((p) => ({ id: p.id, title: p.title, region: p.region })),
		// Experience editing belongs to the profile's actual team; a claim only
		// confirms identity details, so ProfileTab's experience section stays hidden
		// (hasLeader: false).
		existingExperience: [],
		existingLeadership: [],
		form: {
			firstName: staged?.firstName ?? resolved.row.users.firstName,
			otherNames: staged?.otherNames ?? resolved.row.users.otherNames,
			bio: staged?.bio ?? resolved.row.users.bio ?? '',
			positionId: staged?.positionId ?? resolved.currentTerm.positions.id,
			slug: null,
			hasLeader: false,
			verified: false
		},
		photoUrl: stagedDocs.photoUrl ?? null,
		iebcCertificateUrl: stagedDocs.iebcCertificateUrl ?? null,
		pendingVerification: false
	};
};

export const actions: Actions = {
	save: async (event) => {
		const { domainUser, resolved } = await resolveClaimRequest(event);

		const form = await event.request.formData();
		const firstName = String(form.get('firstName') ?? '').trim();
		const otherNames = String(form.get('otherNames') ?? '').trim();
		const bio = String(form.get('bio') ?? '').trim();
		const positionId = Number(form.get('positionId') ?? 0);

		if (!firstName || /\s/.test(firstName)) {
			return fail(400, { error: 'First name is required and must be a single word.', missingFields: ['firstName'] });
		}
		if (!otherNames) return fail(400, { error: 'Other names are required.', missingFields: ['otherNames'] });
		if (!bio) return fail(400, { error: 'Add a short bio.', missingFields: ['bio'] });
		if (!positionId) return fail(400, { error: 'Pick the position.', missingFields: ['positionId'] });
		const [position] = await db
			.select({ id: positions.id })
			.from(positions)
			.where(and(eq(positions.id, positionId), isNull(positions.deletedAt)));
		if (!position) return fail(400, { error: 'That position does not exist.', missingFields: ['positionId'] });

		await stageClaimEvidence(resolved.currentTerm.leaders.id, domainUser.id, {
			profile: { firstName, otherNames, bio, positionId }
		});
		return { saved: true };
	},

	// Photo + IEBC certificate upload (moved here from the old Documentation tab).
	// Files land on disk (UUID-named) but their URLs stage into the claim evidence
	// only — never onto the profile's real leaders row.
	upload: async (event) => {
		const { domainUser, resolved, claim } = await resolveClaimRequest(event);
		const form = await event.request.formData();

		const staged = { ...((claim?.evidence as ClaimEvidence | null)?.documentation ?? {}) };
		let uploadedAny = false;
		for (const kind of Object.keys(DOC_KEY_BY_KIND) as (keyof typeof DOC_KEY_BY_KIND)[]) {
			const file = form.get(kind);
			if (!(file instanceof File) || file.size === 0) continue; // not (re)uploaded this submit
			try {
				staged[DOC_KEY_BY_KIND[kind]] = await saveLeaderDocument(resolved.currentTerm.leaders.id, kind as UploadKind, file);
				uploadedAny = true;
			} catch (err) {
				return fail(400, { error: err instanceof Error ? err.message : 'Upload failed.' });
			}
		}
		if (!uploadedAny) return fail(400, { error: 'Choose a file to upload.' });

		await stageClaimEvidence(resolved.currentTerm.leaders.id, domainUser.id, { documentation: staged });
		return { uploaded: true };
	},

	// The layout's claim widget posts here (like Submit Application in apply mode):
	// national ID + submittedAt mark the staged draft as ready for review. The
	// strongest reviewer is the leader themselves: when the profile has a verified
	// email, mail them a single-use approve/reject link (/claim/[token]); the
	// platform-admin queue stays as the fallback either way.
	submitClaim: async (event) => {
		const { domainUser, slug, resolved, claim } = await resolveClaimRequest(event);
		// The claimant's role + national ID come from the Signoff tab's staged details.
		const nationalId = (claim?.evidence as ClaimEvidence | null)?.signoff?.nationalId;
		if (!nationalId) return fail(400, { claimError: 'Complete the Signoff tab before submitting.' });

		// Any live email works as the leader's inbox: a verified one first, else one
		// harvested from a public directory (contacts.source, e.g. Mzalendo) — sourced
		// emails exist precisely so this link has somewhere to go. The link only grants
		// review of THIS claim, so a stale sourced address fails safe (nobody clicks).
		const emailRows = await db
			.select({ value: contacts.value, verifiedAt: contacts.verifiedAt, source: contacts.source })
			.from(contacts)
			.where(and(eq(contacts.userId, resolved.row.users.id), eq(contacts.channel, 'email'), isNull(contacts.deletedAt)));
		const leaderEmail = emailRows.find((row) => row.verifiedAt) ?? emailRows.find((row) => row.source);
		const leaderToken = leaderEmail ? randomBytes(16).toString('hex') : undefined;

		await stageClaimEvidence(resolved.currentTerm.leaders.id, domainUser.id, {
			nationalId,
			submittedAt: new Date().toISOString(),
			...(leaderToken ? { leaderToken } : {})
		});

		if (leaderEmail && leaderToken) {
			const claimantName = fullName(domainUser);
			await sendEmail({
				to: leaderEmail.value,
				subject: `${claimantName} wants to manage your leaders.ke profile`,
				text: `Hi ${resolved.row.users.firstName},\n\n${claimantName} submitted a claim to manage your profile on leaders.ke.\n\nReview and approve or reject it here:\n${event.url.origin}/claim/${leaderToken}\n\nIf you don't recognize this person, reject the claim — our admins also review every claim.`
			});
		}

		redirectWithFlash(
			event.cookies,
			`/dashboard/claim/${slug}/profile`,
			leaderEmail
				? 'Claim submitted. The leader has been emailed to confirm; an admin can also review it.'
				: 'Claim submitted. An admin will review it and grant you manager access.'
		);
	},

	// "Just testing" escape hatch: drops the pending claim and everything staged in it.
	deleteClaim: async (event) => {
		const { domainUser, resolved } = await resolveClaimRequest(event);
		await deletePendingClaim(resolved.currentTerm.leaders.id, domainUser.id);
		redirectWithFlash(event.cookies, '/dashboard', 'Claim deleted.');
	}
};
