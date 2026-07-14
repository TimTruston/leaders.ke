import { fail, redirect } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { contacts, users } from '$lib/server/db/schema';
import { user as authUsers } from '$lib/server/db/auth.schema';
import { getInviteByToken } from '$lib/server/invites';
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

	return dev
		? { devEmail: lockedEmail ?? env.ADMIN_EMAIL ?? '', devPassword: env.ADMIN_PASSWORD ?? '', next, inviteBanner, lockedEmail }
		: { devEmail: lockedEmail ?? '', devPassword: '', next, inviteBanner, lockedEmail };
};

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const email = form.get('email')?.toString() ?? '';
		const password = form.get('password')?.toString() ?? '';
		const next = safeNext(event.url.searchParams.get('next'));

		// Defense in depth: the email field is only readonly client-side (devtools
		// can bypass it), so re-check server-side against the locked invite email.
		const lockedEmail = event.url.searchParams.get('email');
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
