import { fail, redirect } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { auth, googleAuthEnabled } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { contacts, users } from '$lib/server/db/schema';
import { user as authUsers } from '$lib/server/db/auth.schema';
import { getInviteByToken } from '$lib/server/invites';
import { clearFlash } from '$lib/server/flash';
import { APIError } from 'better-auth/api';
import type { Actions, PageServerLoad } from './$types';

// Only ever redirect to a same-origin relative path — never follow ?next
// anywhere else, that's an open-redirect vector. Citizen is the default landing
// mode; a manager/ambassador/admin switches into their other mode(s) from there.
function safeNext(next: string | null): string {
	return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

export const load: PageServerLoad = async (event) => {
	const next = safeNext(event.url.searchParams.get('next'));
	if (event.locals.user) redirect(302, next);

	// A ?next=/invite/<token> means they arrived here mid-invite; show who invited
	// them so "sign in to accept" isn't a mystery.
	let inviteBanner: { leaderName: string; role: string } | null = null;
	const inviteMatch = next.match(/^\/invite\/([^/]+)$/);
	if (inviteMatch) {
		const invite = await getInviteByToken(inviteMatch[1]);
		if (invite) inviteBanner = { leaderName: invite.leaderName, role: invite.role };
	}

	// ?email= (set by /invite/[token] when the invited address already has an
	// account) locks the email field — prevents signing in with a different email
	// and only discovering the invite mismatch after clicking Accept.
	const lockedEmail = event.url.searchParams.get('email');

	// The flash notice explains why they landed here (e.g. "log in to claim a
	// profile"). hooks only peeks it on /login and /signup, so it survives
	// switching between the two forms; the action clears it on success.
	const notice = event.locals.flash ?? null;

	return dev
		? { devEmail: lockedEmail ?? env.ADMIN_EMAIL ?? '', devPassword: env.ADMIN_PASSWORD ?? '', next, inviteBanner, lockedEmail, notice, googleEnabled: googleAuthEnabled }
		: { devEmail: lockedEmail ?? '', devPassword: '', next, inviteBanner, lockedEmail, notice, googleEnabled: googleAuthEnabled };
};

export const actions: Actions = {
	// Start the Google OAuth flow: better-auth returns the provider URL, we 302 to it.
	// The provider calls back to /api/auth/callback/google (handled in hooks), which
	// then lands on `next`. New Google users are created pre-verified (see auth.ts).
	google: async (event) => {
		const form = await event.request.formData();
		const next = safeNext(form.get('next')?.toString() ?? null);
		let url: string | undefined;
		try {
			const res = await auth.api.signInSocial({
				body: { provider: 'google', callbackURL: next, errorCallbackURL: '/login' },
				headers: event.request.headers
			});
			url = res?.url;
		} catch (error) {
			if (error instanceof APIError) return fail(400, { message: error.message || 'Google sign-in failed' });
			return fail(500, { message: 'Unexpected error' });
		}
		if (!url) return fail(500, { message: 'Could not start Google sign-in.' });
		redirect(302, url);
	},

	email: async (event) => {
		const form = await event.request.formData();
		const email = form.get('email')?.toString() ?? '';
		const password = form.get('password')?.toString() ?? '';
		// action="?/email" replaces the whole query string per URL-resolution rules, so
		// next/lockedEmail ride along as posted hidden fields instead of event.url.
		const next = safeNext(form.get('next')?.toString() ?? null);

		// Defense in depth: the email field is only readonly client-side (devtools
		// can bypass it), so re-check server-side against the locked invite email.
		const lockedEmail = form.get('lockedEmail')?.toString() || null;
		if (lockedEmail && email.trim().toLowerCase() !== lockedEmail.trim().toLowerCase()) {
			return fail(400, { message: `This invite was sent to ${lockedEmail}. Sign in with that email to accept it.` });
		}

		let authUser;
		try {
			({ user: authUser } = await auth.api.signInEmail({ body: { email, password }, headers: event.request.headers }));
		} catch (error) {
			if (error instanceof APIError) return fail(400, { message: error.message || 'Sign in failed' });
			return fail(500, { message: 'Unexpected error' });
		}

		// Signed in — drop the peeked pre-auth notice so it can't resurface on the next page.
		clearFlash(event.cookies);

		let [domainUser] = await db.select().from(users).where(eq(users.authUserId, authUser.id));

		// Arriving via an invite link already proves this inbox is theirs (the invite
		// email had to match to get here) — skip the OTP round-trip and verify it now.
		if (lockedEmail && domainUser && !domainUser.verified.email) {
			await db.update(authUsers).set({ emailVerified: true }).where(eq(authUsers.id, authUser.id));
			[domainUser] = await db
				.update(users)
				.set({ verified: { ...domainUser.verified, email: true } })
				.where(eq(users.id, domainUser.id))
				.returning();
			await db
				.update(contacts)
				.set({ verifiedAt: new Date() })
				.where(and(eq(contacts.userId, domainUser.id), eq(contacts.channel, 'email'), isNull(contacts.deletedAt)));
		}

		if (!domainUser?.verified.email) {
			return redirect(302, `/verify/email?email=${email}&next=${encodeURIComponent(next)}`);
		}

		return redirect(302, next);
	}
};
