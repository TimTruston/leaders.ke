import { fail, redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { APIError } from 'better-auth/api';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	if (!event.locals.user) redirect(302, '/login');
	return {};
};

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const currentPassword = form.get('currentPassword')?.toString() ?? '';
		const newPassword = form.get('newPassword')?.toString() ?? '';

		try {
			await auth.api.changePassword({
				body: { currentPassword, newPassword, revokeOtherSessions: true },
				headers: event.request.headers
			});
		} catch (error) {
			if (error instanceof APIError)
				return fail(400, { message: error.message || 'Could not change password' });
			return fail(500, { message: 'Unexpected error' });
		}

		return { success: true };
	}
};
