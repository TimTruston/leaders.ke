import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { APIError } from 'better-auth/api';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	if (event.locals.user) redirect(302, '/');
	return {};
};

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const firstName = form.get('firstName')?.toString().trim() ?? '';
		const lastName = form.get('lastName')?.toString().trim() ?? '';
		const email = form.get('email')?.toString() ?? '';
		const password = form.get('password')?.toString() ?? '';

		try {
			// better-auth stores a single `name`; the user.create.after hook bridges a profile + email contact.
			const { user } = await auth.api.signUpEmail({
				body: { name: `${firstName} ${lastName}`.trim(), email, password },
				headers: event.request.headers
			});
			// Overwrite the hook's name-split guess with the exact first/last from the form.
			await db.update(users).set({ firstName, lastName }).where(eq(users.authUserId, user.id));
		} catch (error) {
			if (error instanceof APIError)
				return fail(400, { message: error.message || 'Registration failed' });
			return fail(500, { message: 'Unexpected error' });
		}

		return redirect(302, '/');
	}
};
