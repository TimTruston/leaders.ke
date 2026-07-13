import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { getInviteByToken } from '$lib/server/invites';
import { APIError } from 'better-auth/api';
import type { Actions, PageServerLoad } from './$types';

// Only ever redirect to a same-origin relative path — never follow ?next
// anywhere else, that's an open-redirect vector. Citizen is the default landing
// mode; a manager/ambassador/admin switches into their other mode(s) from there.
function safeNext(next: string | null): string {
	return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard/citizen';
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

	return dev
		? { devEmail: env.ADMIN_EMAIL ?? '', devPassword: env.ADMIN_PASSWORD ?? '', next, inviteBanner }
		: { devEmail: '', devPassword: '', next, inviteBanner };
};

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const email = form.get('email')?.toString() ?? '';
		const password = form.get('password')?.toString() ?? '';
		const next = safeNext(event.url.searchParams.get('next'));

		let authUser;
		try {
			({ user: authUser } = await auth.api.signInEmail({ body: { email, password }, headers: event.request.headers }));
		} catch (error) {
			if (error instanceof APIError) return fail(400, { message: error.message || 'Sign in failed' });
			return fail(500, { message: 'Unexpected error' });
		}

		if (!authUser.emailVerified) return redirect(302, `/verify?next=${encodeURIComponent(next)}`);

		const [domainUser] = await db.select({ verified: users.verified }).from(users).where(eq(users.authUserId, authUser.id));
		if (!domainUser?.verified.sms) return redirect(302, `/verify?next=${encodeURIComponent(next)}`);

		return redirect(302, next);
	}
};
