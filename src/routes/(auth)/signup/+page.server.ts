import { fail, redirect } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { contacts, users } from '$lib/server/db/schema';
import { user as authUsers } from '$lib/server/db/auth.schema';
import { getInviteByToken } from '$lib/server/invites';
import { APIError } from 'better-auth/api';
import type { Actions, PageServerLoad } from './$types';

// Only ever redirect to a same-origin relative path — never follow ?next
// anywhere else, that's an open-redirect vector. Citizen is the default landing
// mode — signup doesn't push straight into "launch a campaign".
function safeNext(next: string | null): string {
	return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
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

	// ?email= (set by /invite/[token] when the invited address has no account yet)
	// locks the email field — prevents signing up with a different email and only
	// discovering the invite mismatch after clicking Accept.
	const lockedEmail = event.url.searchParams.get('email');

	return { next, inviteBanner, lockedEmail };
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

		// Defense in depth: the email field is only readonly client-side (devtools
		// can bypass it), so re-check server-side against the locked invite email.
		const lockedEmail = event.url.searchParams.get('email');
		if (lockedEmail && email.trim().toLowerCase() !== lockedEmail.trim().toLowerCase()) {
			return fail(400, { message: `This invite was sent to ${lockedEmail}. Sign up with that email to accept it.` });
		}

		try {
			// better-auth stores a single `name`; the user.create.after hook bridges a profile + email contact.
			const { user } = await auth.api.signUpEmail({
				body: { name: `${firstName} ${otherNames}`.trim(), email, password },
				headers: event.request.headers
			});
			// Overwrite the hook's name-split guess with the exact values from the form.
			const [domainUser] = await db
				.update(users)
				.set({ firstName, otherNames })
				.where(eq(users.authUserId, user.id))
				.returning();

			// Arriving via an invite link already proves this inbox is theirs (the invite
			// email had to match to get here) — skip the OTP round-trip and verify it now.
			if (lockedEmail) {
				await db.update(authUsers).set({ emailVerified: true }).where(eq(authUsers.id, user.id));
				await db.update(users).set({ verified: { ...domainUser.verified, email: true } }).where(eq(users.id, domainUser.id));
				await db
					.update(contacts)
					.set({ verifiedAt: new Date() })
					.where(and(eq(contacts.userId, domainUser.id), eq(contacts.channel, 'email'), isNull(contacts.deletedAt)));
			}
		} catch (error) {
			if (error instanceof APIError)
				return fail(400, { message: error.message || 'Registration failed' });
			return fail(500, { message: 'Unexpected error' });
		}

		// New accounts land on /verify/email first to confirm email
		return redirect(302, `/verify/email?email=${email}&next=${encodeURIComponent(next)}`);
	}
};
