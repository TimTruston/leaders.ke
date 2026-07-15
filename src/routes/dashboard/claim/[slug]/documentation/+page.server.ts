// Claim-family Documentation tab: uploads land on disk like any other, but the
// URLs stage into the pending claim's evidence — never onto the leaders row —
// so a claimant can't replace the profile's real documents before approval.
// (Files are UUID-named, so sharing the leader's upload dir can't overwrite.)
import { fail } from '@sveltejs/kit';
import { resolveClaimRequest, stageClaimEvidence, type ClaimEvidence } from '$lib/server/claims';
import { saveLeaderDocument, type UploadKind } from '$lib/server/storage';
import type { Actions, PageServerLoad } from './$types';

// The campaign's items only — the claimant's ID images live on the Signoff tab.
const COLUMN_BY_KIND = {
	photo: 'photoUrl',
	'iebc-certificate': 'iebcCertificateUrl'
} as const;

export const load: PageServerLoad = async (event) => {
	const { claim } = await resolveClaimRequest(event);
	// Only the claimant's own staged uploads — the profile's real documents (IDs!)
	// must never leak to someone merely attempting a claim.
	const staged = (claim?.evidence as ClaimEvidence | null)?.documentation ?? {};

	return {
		photoUrl: staged.photoUrl ?? null,
		iebcCertificateUrl: staged.iebcCertificateUrl ?? null
	};
};

export const actions: Actions = {
	upload: async (event) => {
		const { domainUser, resolved, claim } = await resolveClaimRequest(event);
		const form = await event.request.formData();

		const staged = { ...((claim?.evidence as ClaimEvidence | null)?.documentation ?? {}) };
		let uploadedAny = false;
		for (const kind of Object.keys(COLUMN_BY_KIND) as (keyof typeof COLUMN_BY_KIND)[]) {
			const file = form.get(kind);
			if (!(file instanceof File) || file.size === 0) continue; // not (re)uploaded this submit
			try {
				staged[COLUMN_BY_KIND[kind]] = await saveLeaderDocument(resolved.currentTerm.leaders.id, kind as UploadKind, file);
				uploadedAny = true;
			} catch (err) {
				return fail(400, { error: err instanceof Error ? err.message : 'Upload failed.' });
			}
		}
		if (!uploadedAny) return fail(400, { error: 'Choose at least one file to upload.' });

		await stageClaimEvidence(resolved.currentTerm.leaders.id, domainUser.id, { documentation: staged });
		return { uploaded: true };
	}
};
