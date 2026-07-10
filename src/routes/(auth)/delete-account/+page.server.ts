import { fail, redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { APIError } from 'better-auth/api';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	if (!event.locals.user) redirect(302, '/login');
	return { email: event.locals.user.email };
};

export const actions: Actions = {
	default: async (event) => {
		if (!event.locals.user) redirect(302, '/login');

		const form = await event.request.formData();
		const password = form.get('password')?.toString() ?? '';

		try {
			// Password-confirmed, immediate delete. The authUserId cascade removes the profile + contacts.
			await auth.api.deleteUser({ body: { password }, headers: event.request.headers });
		} catch (error) {
			if (error instanceof APIError)
				return fail(400, { message: error.message || 'Could not delete account' });
			return fail(500, { message: 'Unexpected error' });
		}

		return redirect(302, '/');
	}
};
