import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { getInviteByToken } from '$lib/server/invites';
import { APIError } from 'better-auth/api';
import type { Actions, PageServerLoad } from './$types';

// Only ever redirect to a same-origin relative path — never follow ?next
// anywhere else, that's an open-redirect vector. Citizen is the default landing
// mode — signup doesn't push straight into "launch a campaign".
function safeNext(next: string | null): string {
	return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard/citizen';
}

export const load: PageServerLoad = async (event) => {
	const next = safeNext(event.url.searchParams.get('next'));
	if (event.locals.user) redirect(302, next);

	let inviteBanner: { leaderName: string; role: string } | null = null;
	const inviteMatch = next.match(/^\/invite\/([^/]+)$/);
	if (inviteMatch) {
		const invite = await getInviteByToken(inviteMatch[1]);
		if (invite) inviteBanner = { leaderName: invite.leaderName, role: invite.role };
	}

	return { next, inviteBanner };
};

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const firstName = form.get('firstName')?.toString().trim() ?? '';
		const otherNames = form.get('otherNames')?.toString().trim() ?? '';
		const email = form.get('email')?.toString() ?? '';
		const password = form.get('password')?.toString() ?? '';
		const next = safeNext(event.url.searchParams.get('next'));

		// First name is a single token; multi-word surnames belong in otherNames.
		if (/\s/.test(firstName)) {
			return fail(400, { message: 'First name must be a single word. Put the rest in other names.' });
		}

		try {
			// better-auth stores a single `name`; the user.create.after hook bridges a profile + email contact.
			const { user } = await auth.api.signUpEmail({
				body: { name: `${firstName} ${otherNames}`.trim(), email, password },
				headers: event.request.headers
			});
			// Overwrite the hook's name-split guess with the exact values from the form.
			await db.update(users).set({ firstName, otherNames }).where(eq(users.authUserId, user.id));
		} catch (error) {
			if (error instanceof APIError)
				return fail(400, { message: error.message || 'Registration failed' });
			return fail(500, { message: 'Unexpected error' });
		}

		// The unverified-email nudge lives in the dashboard layout now (shows on every
		// mode/page for as long as the account is unverified), so this is just `next`.
		return redirect(302, next);
	}
};
