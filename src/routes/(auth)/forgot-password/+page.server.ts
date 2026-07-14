import { fail } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { checkPasswordResetRateLimit } from '$lib/server/otp';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const email = form.get('email')?.toString().trim().toLowerCase() ?? '';

		try {
			// Doesn't reveal whether the email has an account — only that this
			// particular address is being hit too often, which isn't sensitive.
			await checkPasswordResetRateLimit(email);
		} catch (error) {
			return fail(400, { message: error instanceof Error ? error.message : 'Could not send reset email' });
		}

		try {
			// Emails a reset link once emailAndPassword.sendResetPassword + Postmark are wired.
			await auth.api.requestPasswordReset({
				body: { email, redirectTo: '/reset-password' },
				headers: event.request.headers
			});
		} catch {
			// Swallow: always report the same result so we don't reveal which emails have accounts.
		}

		return { sent: true };
	}
};
