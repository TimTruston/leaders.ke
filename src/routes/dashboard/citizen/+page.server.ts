import { fail } from '@sveltejs/kit';
import { requireDashboardUser } from '$lib/server/dashboard';
import { listFollowedLeaders, listFollowedLeadersFeed, listMyPledges } from '$lib/server/citizen';
import { auth } from '$lib/server/auth';
import { APIError } from 'better-auth/api';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { domainUser } = await requireDashboardUser(event);

	const [followedLeaders, feed, pledges] = await Promise.all([
		listFollowedLeaders(domainUser.id),
		listFollowedLeadersFeed(domainUser.id),
		listMyPledges(domainUser.id)
	]);

	return { followedLeaders, feed, pledges };
};

export const actions: Actions = {
	resend: async (event) => {
		const { authUser } = await requireDashboardUser(event);

		try {
			await auth.api.sendVerificationEmail({
				body: { email: authUser.email, callbackURL: '/dashboard/citizen' },
				headers: event.request.headers
			});
		} catch (error) {
			if (error instanceof APIError) return fail(400, { error: error.message || 'Could not send verification email' });
			return fail(500, { error: 'Unexpected error' });
		}

		return { resent: true };
	}
};
