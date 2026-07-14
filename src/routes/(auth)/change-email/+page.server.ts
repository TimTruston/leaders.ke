import { fail, redirect } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { contacts, users } from '$lib/server/db/schema';
import { user as authUsers } from '$lib/server/db/auth.schema';
import { requireDashboardUser } from '$lib/server/dashboard';
import { otpCooldownRemainingForUser, sendOtp, verifyOtpLinkToken, verifyOtpWithDestination } from '$lib/server/otp';
import type { Actions, PageServerLoad } from './$types';

/** Applies a confirmed email change everywhere it's tracked: the auth account
 * (so future logins use it), the domain contacts row, and the verified cache. */
async function applyEmailChange(domainUserId: number, authUserId: string, newEmail: string) {
	await db.update(authUsers).set({ email: newEmail, emailVerified: true }).where(eq(authUsers.id, authUserId));

	const [existing] = await db
		.select({ id: contacts.id })
		.from(contacts)
		.where(and(eq(contacts.userId, domainUserId), eq(contacts.channel, 'email'), isNull(contacts.deletedAt)));
	if (existing) {
		await db.update(contacts).set({ deletedAt: new Date() }).where(eq(contacts.id, existing.id));
	}
	await db.insert(contacts).values({ userId: domainUserId, channel: 'email', value: newEmail, isPrimary: true, verifiedAt: new Date() });

	const [domainUser] = await db.select({ verified: users.verified }).from(users).where(eq(users.id, domainUserId));
	await db.update(users).set({ verified: { ...domainUser.verified, email: true } }).where(eq(users.id, domainUserId));
}

export const load: PageServerLoad = async (event) => {
	const { authUser, domainUser } = await requireDashboardUser(event);

	const linkToken = event.url.searchParams.get('linkToken');
	if (linkToken) {
		const result = await verifyOtpLinkToken(linkToken);
		if (result?.userId === domainUser.id) {
			await applyEmailChange(domainUser.id, authUser.id, result.destination);
			redirect(302, `/dashboard/account?emailChanged=${encodeURIComponent(result.destination)}`);
		}
		return { currentEmail: authUser.email, linkError: 'This link is invalid or has expired.', cooldown: 0 };
	}

	const cooldown = await otpCooldownRemainingForUser(domainUser.id, 'email');
	return { currentEmail: authUser.email, linkError: null, cooldown };
};

export const actions: Actions = {
	requestChange: async (event) => {
		const { authUser, domainUser } = await requireDashboardUser(event);
		const form = await event.request.formData();
		const newEmail = form.get('newEmail')?.toString().trim().toLowerCase() ?? '';
		if (!newEmail || !newEmail.includes('@')) return fail(400, { message: 'Enter a valid email address.' });
		if (newEmail === authUser.email.toLowerCase()) return fail(400, { message: "That's already your email." });

		const [taken] = await db.select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.email, newEmail));
		if (taken) return fail(400, { message: 'That email is already in use.' });

		try {
			await sendOtp(domainUser.id, 'email', newEmail, domainUser.firstName, '/change-email');
		} catch (error) {
			return fail(400, { message: error instanceof Error ? error.message : 'Could not send code' });
		}
		return { sent: true, newEmail };
	},

	confirmCode: async (event) => {
		const { authUser, domainUser } = await requireDashboardUser(event);
		const form = await event.request.formData();
		const code = String(form.get('code') ?? '').trim();
		if (!code) return fail(400, { codeError: 'Enter the code you received.' });

		const result = await verifyOtpWithDestination(domainUser.id, 'email', code);
		if (!result.ok || !result.destination) return fail(400, { codeError: 'That code is invalid or expired.' });

		await applyEmailChange(domainUser.id, authUser.id, result.destination);
		redirect(302, `/dashboard/account?emailChanged=${encodeURIComponent(result.destination)}`);
	}
};
