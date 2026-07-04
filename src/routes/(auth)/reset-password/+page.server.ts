import { fail, redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { APIError } from 'better-auth/api';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	// The reset link carries ?token=…; missing token means the page was opened directly.
	return { token: url.searchParams.get('token') ?? '' };
};

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const password = form.get('password')?.toString() ?? '';
		const token = form.get('token')?.toString() ?? '';

		if (!token) return fail(400, { message: 'This reset link is invalid or has expired.' });

		try {
			await auth.api.resetPassword({ body: { newPassword: password, token } });
		} catch (error) {
			if (error instanceof APIError)
				return fail(400, { message: error.message || 'Could not reset password' });
			return fail(500, { message: 'Unexpected error' });
		}

		return redirect(302, '/login');
	}
};
