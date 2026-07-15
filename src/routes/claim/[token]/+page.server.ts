// Leader-approval page for a claim, reached from the email sent on claim
// submission. Deliberately auth-free: the leader may have no login (phantom
// profiles) — possession of the single-use token IS the authorization, exactly
// like an invite link. Once decided, the token stops resolving.
import { error, fail } from '@sveltejs/kit';
import { findClaimByLeaderToken, reviewClaim } from '$lib/server/claims';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const claim = await findClaimByLeaderToken(params.token);
	if (!claim) error(404, 'This link has expired or the claim was already decided.');

	return { claimantName: claim.claimantName, subjectName: claim.subjectName };
};

export const actions: Actions = {
	decide: async (event) => {
		const claim = await findClaimByLeaderToken(event.params.token);
		if (!claim) return fail(404, { error: 'This link has expired or the claim was already decided.' });

		const form = await event.request.formData();
		const decision = String(form.get('decision') ?? '');
		if (decision !== 'approved' && decision !== 'rejected') return fail(400, { error: 'Pick approve or reject.' });

		// The leader's own users row is recorded as the reviewer — approval makes
		// the claimant an admin manager via the same path admins use.
		const result = await reviewClaim(claim.claimId, claim.subjectUserId, decision, 'Decided by the leader via email link.');
		if (!result.ok) return fail(400, { error: result.error });

		return { decided: decision };
	}
};
