import { error, fail, redirect } from '@sveltejs/kit';
import { getDomainUser, resolveCurrentTerm } from '$lib/server/leader';
import { requestClaim } from '$lib/server/claims';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const resolved = await resolveCurrentTerm(params.leader);
	// Only verified (public) profiles are claimable — an unverified one belongs to
	// the account still building it, so there's nothing to "claim". Matches /[leader].
	if (!resolved || !resolved.currentTerm.leaders.verifiedAt) error(404, 'Leader not found');

	if (!locals.user) {
		redirect(302, `/login?next=${encodeURIComponent(`/claim/${params.leader}`)}`);
	}

	return {
		leaderName: `${resolved.row.users.firstName} ${resolved.row.users.otherNames}`.trim(),
		positionTitle: resolved.currentTerm.positions.title,
		region: resolved.currentTerm.positions.region
	};
};

export const actions: Actions = {
	default: async (event) => {
		if (!event.locals.user) return fail(401, { error: 'Sign in first.' });
		const domainUser = await getDomainUser(event.locals.user.id);
		if (!domainUser) return fail(401, { error: 'Sign in first.' });

		const resolved = await resolveCurrentTerm(event.params.leader);
		if (!resolved || !resolved.currentTerm.leaders.verifiedAt) return fail(404, { error: 'Leader not found.' });

		const form = await event.request.formData();
		const nationalId = String(form.get('nationalId') ?? '').trim();
		const note = String(form.get('note') ?? '').trim();
		if (!nationalId) return fail(400, { error: 'Your national ID number is required.' });

		const result = await requestClaim(resolved.currentTerm.leaders.id, domainUser.id, { nationalId, note });
		if (!result.ok) return fail(400, { error: result.error });

		return { requested: true };
	}
};
