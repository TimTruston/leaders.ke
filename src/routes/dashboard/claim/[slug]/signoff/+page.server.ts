// Claim-family Signoff tab: the claimant's attestation, staged entirely into
// the pending claim's evidence (role, national ID, and their own ID images).
// The submit widget reads the national ID from here.
import { fail } from '@sveltejs/kit';
import { resolveClaimRequest, stageClaimEvidence, type ClaimEvidence } from '$lib/server/claims';
import { isCampaignRole } from '$lib/utils/campaignRoles';
import { saveLeaderDocument, type UploadKind } from '$lib/server/storage';
import type { Actions, PageServerLoad } from './$types';

const URL_BY_KIND = { 'id-front': 'idFrontUrl', 'id-back': 'idBackUrl' } as const;

export const load: PageServerLoad = async (event) => {
	const { claim } = await resolveClaimRequest(event);
	const staged = (claim?.evidence as ClaimEvidence | null)?.signoff;
	return {
		myRole: staged?.myRole ?? '',
		nationalId: staged?.nationalId ?? '',
		idFrontUrl: staged?.idFrontUrl ?? null,
		idBackUrl: staged?.idBackUrl ?? null
	};
};

export const actions: Actions = {
	saveMyDetails: async (event) => {
		const { domainUser, resolved, claim } = await resolveClaimRequest(event);
		const form = await event.request.formData();
		const myRole = String(form.get('myRole') ?? '').trim();
		const nationalId = String(form.get('nationalId') ?? '').trim();
		if (!isCampaignRole(myRole)) return fail(400, { error: 'Pick your role in this campaign.' });
		if (!nationalId) return fail(400, { error: 'Enter your national ID number.' });

		const staged = (claim?.evidence as ClaimEvidence | null)?.signoff;
		await stageClaimEvidence(resolved.currentTerm.leaders.id, domainUser.id, {
			signoff: { ...staged, myRole, nationalId }
		});
		return { detailsSaved: true };
	},

	upload: async (event) => {
		const { domainUser, resolved, claim } = await resolveClaimRequest(event);
		const form = await event.request.formData();

		// Files land on disk (UUID-named, so they can't overwrite the profile's real
		// documents); the URLs stage in the claim evidence only.
		const staged = { ...((claim?.evidence as ClaimEvidence | null)?.signoff ?? {}) };
		let uploadedAny = false;
		for (const kind of Object.keys(URL_BY_KIND) as (keyof typeof URL_BY_KIND)[]) {
			const file = form.get(kind);
			if (!(file instanceof File) || file.size === 0) continue;
			try {
				staged[URL_BY_KIND[kind]] = await saveLeaderDocument(resolved.currentTerm.leaders.id, kind as UploadKind, file);
				uploadedAny = true;
			} catch (err) {
				return fail(400, { error: err instanceof Error ? err.message : 'Upload failed.' });
			}
		}
		if (!uploadedAny) return fail(400, { error: 'Choose a file to upload.' });

		await stageClaimEvidence(resolved.currentTerm.leaders.id, domainUser.id, { signoff: staged });
		return { uploaded: true };
	}
};
