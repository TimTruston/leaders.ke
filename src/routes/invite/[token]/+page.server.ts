import { fail, redirect } from '@sveltejs/kit';
import { getDomainUser } from '$lib/server/leader';
import { acceptInvite, getInviteByToken } from '$lib/server/invites';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const invite = await getInviteByToken(params.token);

	// Signed out: send them to sign in/up first, remembering to come straight
	// back here (as a signed-in visitor) instead of making them re-open the email.
	if (!locals.user) {
		redirect(302, `/login?next=${encodeURIComponent(`/invite/${params.token}`)}`);
	}

	return { invite };
};

export const actions: Actions = {
	accept: async (event) => {
		if (!event.locals.user) return fail(401, { error: 'Sign in first.' });
		const domainUser = await getDomainUser(event.locals.user.id);
		if (!domainUser) return fail(401, { error: 'Sign in first.' });

		const result = await acceptInvite(event.params.token, domainUser.id, event.locals.user.email);
		if (!result.ok) return fail(400, { error: result.error });

		return { accepted: true, role: result.role };
	}
};
