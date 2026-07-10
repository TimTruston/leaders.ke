import { fail, redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { APIError } from 'better-auth/api';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const user = event.locals.user;
	if (!user) redirect(302, '/login');
	return { email: user.email, verified: user.emailVerified };
};

export const actions: Actions = {
	default: async (event) => {
		const user = event.locals.user;
		if (!user) redirect(302, '/login');

		try {
			// Emails a fresh verification link (via the mailer / console stub).
			await auth.api.sendVerificationEmail({
				body: { email: user.email, callbackURL: '/dashboard' },
				headers: event.request.headers
			});
		} catch (error) {
			if (error instanceof APIError)
				return fail(400, { message: error.message || 'Could not send verification email' });
			return fail(500, { message: 'Unexpected error' });
		}

		return { sent: true };
	}
};
