import { error } from '@sveltejs/kit';
import { getDomainUser } from '$lib/server/leader';
import { getClaimApprovalPreview } from '$lib/server/claims';
import type { PageServerLoad } from './$types';

// /[leader]/claims/[claimId]: how this profile will look once this specific
// claim is approved — the live profile with the claim's staged edits overlaid.
// Scoped by both the slug AND the claimId: two different people can each have
// their own live claim on the same profile, so the claimId is what
// disambiguates "which one" when there's more than one. Viewable by an admin,
// the claim's own claimant, or an active manager of the profile.
export const load: PageServerLoad = async ({ params, locals }) => {
	const viewer = locals.user ? await getDomainUser(locals.user.id) : null;

	const preview = await getClaimApprovalPreview(params.leader, Number(params.claimId), {
		viewerId: viewer?.id,
		isAdmin: !!viewer?.adminAt
	});
	if (!preview) error(404, 'Claim not found');
	return { preview };
};
