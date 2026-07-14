import { fail, redirect } from '@sveltejs/kit';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { contacts, user, users } from '$lib/server/db/schema';
import { requireDashboardUser, type DashboardUser } from '$lib/server/dashboard';
import { hasPendingOtp, otpCooldownRemaining, sendOtp, verifyOtpWithDestination, verifyOtpLinkToken } from '$lib/server/otp';
import { getPlatformSettings } from '$lib/server/settings';
import type { Actions, PageServerLoad } from './$types';

// Only ever redirect to a same-origin relative path — never follow ?next anywhere else.
function safeNext(next: string | null): string {
	return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

function withNotice(path: string, message: string): string {
	return `${path}${path.includes('?') ? '&' : '?'}notice=${encodeURIComponent(message)}`;
}

/** The candidate email to verify: the ?email= param (e.g. an inline change on the
 * account page) or, when absent, the account's current login email (post-signup). */
function candidateEmail(url: URL, authEmail: string): string {
	const raw = url.searchParams.get('email')?.trim().toLowerCase();
	return raw && raw.includes('@') ? raw : authEmail;
}

/** Only another account's *verified* hold blocks a claim; an unverified one is fair game. */
async function verifiedByOther(userId: number, email: string): Promise<boolean> {
	const [held] = await db
		.select({ userId: contacts.userId, verifiedAt: contacts.verifiedAt })
		.from(contacts)
		.where(and(eq(contacts.channel, 'email'), eq(contacts.value, email), isNull(contacts.deletedAt)))
		.limit(1);
	return !!(held && held.userId !== userId && held.verifiedAt);
}

// A confirmed email becomes the account's login email + verified contact, and flips
// every place verification is tracked: the denormalized `users.verified` cache and
// better-auth's own `user`. Handles both post-signup (email === current) and an
// inline change (email differs — the login email moves to the new address).
async function applyEmailVerified(domainUser: DashboardUser['domainUser'], authUserId: string, email: string) {
	// Drop this user's prior live email row and any other account's *unverified* hold
	// of the new value, so the (channel, value) unique index can't collide on insert.
	await db
		.update(contacts)
		.set({ deletedAt: new Date() })
		.where(and(eq(contacts.userId, domainUser.id), eq(contacts.channel, 'email'), isNull(contacts.deletedAt)));
	await db
		.update(contacts)
		.set({ deletedAt: new Date() })
		.where(and(eq(contacts.channel, 'email'), eq(contacts.value, email), isNull(contacts.deletedAt), ne(contacts.userId, domainUser.id)));

	await db.insert(contacts).values({ userId: domainUser.id, channel: 'email', value: email, isPrimary: true, verifiedAt: new Date() });
	await db.update(users).set({ verified: { ...domainUser.verified, email: true } }).where(eq(users.id, domainUser.id));
	await db.update(user).set({ email, emailVerified: true }).where(eq(user.id, authUserId));
}

export const load: PageServerLoad = async (event) => {
	const { authUser, domainUser } = await requireDashboardUser(event);
	const next = safeNext(event.url.searchParams.get('next'));
	const email = candidateEmail(event.url, authUser.email);

	// Click-through link from the email itself.
	const linkToken = event.url.searchParams.get('linkToken');
	if (linkToken) {
		const result = await verifyOtpLinkToken(linkToken);
		if (result?.userId === domainUser.id) {
			await applyEmailVerified(domainUser, authUser.id, result.destination);
			redirect(302, withNotice(next, `${result.destination} verified.`));
		}
	}

	// Verifying the current login email that's already verified — nothing to do.
	if (email === authUser.email && domainUser.verified.email) {
		redirect(302, withNotice(next, 'Your email address is already verified.'));
	}
	if (await verifiedByOther(domainUser.id, email)) {
		redirect(302, withNotice('/dashboard/account', 'That email is already verified on another account.'));
	}

	// Auto-send a code on arrival only if none is already outstanding for this
	// address — so a page refresh reuses the code already sent instead of firing a
	// new one. A later resend is a deliberate button click.
	let emailCooldown = await otpCooldownRemaining('email', email);
	if (!(await hasPendingOtp('email', email))) {
		try {
			await sendOtp(domainUser.id, 'email', email, domainUser.firstName);
			emailCooldown = (await getPlatformSettings()).otpCooldownSeconds;
		} catch {
			// Best-effort — the "Resend code" button still lets them retry manually.
		}
	}

	return { next, email, emailCooldown };
};

export const actions: Actions = {
	sendEmailCode: async (event) => {
		const { authUser, domainUser } = await requireDashboardUser(event);
		const form = await event.request.formData();
		const typed = String(form.get('email') ?? '').trim().toLowerCase();
		const email = typed.includes('@') ? typed : authUser.email;
		if (await verifiedByOther(domainUser.id, email)) {
			return fail(400, { emailError: 'That email is already verified on another account.' });
		}
		try {
			await sendOtp(domainUser.id, 'email', email, domainUser.firstName);
		} catch (error) {
			return fail(400, { emailError: error instanceof Error ? error.message : 'Could not send code' });
		}
		return { emailSent: true };
	},

	verifyCode: async (event) => {
		const { authUser, domainUser } = await requireDashboardUser(event);
		const form = await event.request.formData();
		const code = String(form.get('code') ?? '').trim();
		const next = safeNext(String(form.get('next') ?? '/dashboard/account'));
		if (!code) return fail(400, { codeError: 'Enter the code you received.' });

		const result = await verifyOtpWithDestination(domainUser.id, 'email', code);
		if (!result.ok || !result.destination) return fail(400, { codeError: 'That code is invalid or expired.' });

		await applyEmailVerified(domainUser, authUser.id, result.destination);
		redirect(302, withNotice(next, `You have successfully verified ${result.destination}`));
	}
};
