import { fail, redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { APIError } from 'better-auth/api';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	if (!event.locals.user) redirect(302, '/login');
	// Show the current email so the user knows what they're changing from.
	return { currentEmail: event.locals.user.email };
};

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const newEmail = form.get('newEmail')?.toString() ?? '';

		try {
			// Requires user.changeEmail.enabled in auth.ts; sends a confirmation to the new address.
			await auth.api.changeEmail({
				body: { newEmail, callbackURL: '/' },
				headers: event.request.headers
			});
		} catch (error) {
			if (error instanceof APIError)
				return fail(400, { message: error.message || 'Could not change email' });
			return fail(500, { message: 'Unexpected error' });
		}

		return { success: true };
	}
};
