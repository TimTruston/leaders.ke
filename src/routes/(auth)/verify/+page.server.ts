import { fail, redirect } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { contacts, user, users } from '$lib/server/db/schema';
import { requireDashboardUser, type DashboardUser } from '$lib/server/dashboard';
import { normalizeKenyanPhone } from '$lib/utils/phone';
import { otpCooldownRemaining, sendOtp, verifyOtp, verifyOtpLinkToken } from '$lib/server/otp';
import type { Actions, PageServerLoad } from './$types';

// Only ever redirect to a same-origin relative path — never follow ?next anywhere else.
function safeNext(next: string | null): string {
	return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard/citizen';
}

async function getSmsContact(userId: number) {
	const [row] = await db
		.select({ id: contacts.id, value: contacts.value, verifiedAt: contacts.verifiedAt })
		.from(contacts)
		.where(and(eq(contacts.userId, userId), eq(contacts.channel, 'sms'), isNull(contacts.deletedAt)));
	return row ?? null;
}

// Stamps both the source-of-truth `contacts` row and the denormalized
// `users.verified` cache (read for free off the `domainUser` row every
// dashboard/login check already loads, no extra `contacts` query needed there).
async function markContactVerified(domainUser: DashboardUser['domainUser'], channel: 'email' | 'sms', authUserId?: string) {
	await db
		.update(contacts)
		.set({ verifiedAt: new Date() })
		.where(and(eq(contacts.userId, domainUser.id), eq(contacts.channel, channel), isNull(contacts.deletedAt)));
	await db
		.update(users)
		.set({ verified: { ...domainUser.verified, [channel]: true } })
		.where(eq(users.id, domainUser.id));
	if (channel === 'email' && authUserId) {
		await db.update(user).set({ emailVerified: true }).where(eq(user.id, authUserId));
	}
}

export const load: PageServerLoad = async (event) => {
	const { authUser, domainUser } = await requireDashboardUser(event);
	const next = safeNext(event.url.searchParams.get('next'));

	const linkToken = event.url.searchParams.get('linkToken');
	if (linkToken && !authUser.emailVerified) {
		const verifiedUserId = await verifyOtpLinkToken(linkToken);
		if (verifiedUserId === domainUser.id) {
			await markContactVerified(domainUser, 'email', authUser.id);
			redirect(302, `/verify?next=${encodeURIComponent(next)}`);
		}
	}

	const phoneVerified = domainUser.verified.sms;
	if (authUser.emailVerified && phoneVerified) redirect(302, next);

	const sms = await getSmsContact(domainUser.id);
	const [emailCooldown, phoneCooldown] = await Promise.all([
		otpCooldownRemaining('email', authUser.email),
		sms?.value ? otpCooldownRemaining('sms', sms.value) : 0
	]);

	return {
		next,
		email: authUser.email,
		emailVerified: authUser.emailVerified,
		emailCooldown,
		phone: sms?.value ?? '',
		phoneVerified,
		phoneCooldown
	};
};

export const actions: Actions = {
	sendEmailCode: async (event) => {
		const { authUser, domainUser } = await requireDashboardUser(event);
		try {
			await sendOtp(domainUser.id, 'email', authUser.email, domainUser.firstName);
		} catch (error) {
			return fail(400, { emailError: error instanceof Error ? error.message : 'Could not send code' });
		}
		return { emailSent: true };
	},

	sendPhoneCode: async (event) => {
		const { domainUser } = await requireDashboardUser(event);
		const form = await event.request.formData();
		const raw = String(form.get('phone') ?? '');
		const normalized = normalizeKenyanPhone(raw);
		if (!normalized) return fail(400, { phoneError: 'Enter a valid Kenyan phone number.' });

		// Someone else may already hold this number: block if they've verified it,
		// otherwise it's fair game (first to verify wins, same as any unclaimed number).
		const [held] = await db
			.select({ id: contacts.id, userId: contacts.userId, verifiedAt: contacts.verifiedAt })
			.from(contacts)
			.where(and(eq(contacts.channel, 'sms'), eq(contacts.value, normalized), isNull(contacts.deletedAt)))
			.limit(1);
		const heldByOther = held && held.userId !== domainUser.id ? held : null;
		if (heldByOther?.verifiedAt) {
			return fail(400, { phoneError: 'This number is already verified on another account.' });
		}

		const existing = await getSmsContact(domainUser.id);
		if (existing && existing.value !== normalized) {
			await db.update(contacts).set({ deletedAt: new Date() }).where(eq(contacts.id, existing.id));
		}
		if (heldByOther) {
			await db.update(contacts).set({ deletedAt: new Date() }).where(eq(contacts.id, heldByOther.id));
		}
		if (!existing || existing.value !== normalized) {
			await db.insert(contacts).values({ userId: domainUser.id, channel: 'sms', value: normalized, isPrimary: true }).onConflictDoNothing();
		}

		try {
			await sendOtp(domainUser.id, 'sms', normalized);
		} catch (error) {
			return fail(400, { phoneError: error instanceof Error ? error.message : 'Could not send code' });
		}
		return { phoneSent: true };
	},

	// One code box for both channels: try email first, then sms, whichever the code matches.
	verifyCode: async (event) => {
		const { authUser, domainUser } = await requireDashboardUser(event);
		const form = await event.request.formData();
		const code = String(form.get('code') ?? '').trim();
		if (!code) return fail(400, { codeError: 'Enter the code you received.' });

		if (await verifyOtp(domainUser.id, 'email', code)) {
			await markContactVerified(domainUser, 'email', authUser.id);
			return { verifiedChannel: 'email' };
		}

		if (await verifyOtp(domainUser.id, 'sms', code)) {
			await markContactVerified(domainUser, 'sms');
			return { verifiedChannel: 'sms' };
		}

		return fail(400, { codeError: 'That code is invalid or expired.' });
	}
};
