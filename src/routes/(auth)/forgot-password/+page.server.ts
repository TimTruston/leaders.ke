import { auth } from '$lib/server/auth';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const email = form.get('email')?.toString() ?? '';

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
