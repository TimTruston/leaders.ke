import { fail, redirect } from '@sveltejs/kit';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { contacts, users } from '$lib/server/db/schema';
import { requireDashboardUser, type DashboardUser } from '$lib/server/dashboard';
import { normalizeKenyanPhone } from '$lib/utils/phone';
import { hasPendingOtp, otpCooldownRemaining, sendOtp, verifyOtpWithDestination } from '$lib/server/otp';
import { getPlatformSettings } from '$lib/server/settings';
import type { Actions, PageServerLoad } from './$types';

// Only ever redirect to a same-origin relative path — never follow ?next anywhere else.
function safeNext(next: string | null): string {
	return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

function withNotice(path: string, message: string): string {
	return `${path}${path.includes('?') ? '&' : '?'}notice=${encodeURIComponent(message)}`;
}

async function getSmsContact(userId: number) {
	const [row] = await db
		.select({ value: contacts.value, verifiedAt: contacts.verifiedAt })
		.from(contacts)
		.where(and(eq(contacts.userId, userId), eq(contacts.channel, 'sms'), isNull(contacts.deletedAt)));
	return row ?? null;
}

/** Only another account's *verified* hold blocks a claim; an unverified one is fair game. */
async function verifiedByOther(userId: number, phone: string): Promise<boolean> {
	const [held] = await db
		.select({ userId: contacts.userId, verifiedAt: contacts.verifiedAt })
		.from(contacts)
		.where(and(eq(contacts.channel, 'sms'), eq(contacts.value, phone), isNull(contacts.deletedAt)))
		.limit(1);
	return !!(held && held.userId !== userId && held.verifiedAt);
}

// A confirmed number becomes the account's single verified SMS contact.
async function applyPhoneVerified(domainUser: DashboardUser['domainUser'], phone: string) {
	await db
		.update(contacts)
		.set({ deletedAt: new Date() })
		.where(and(eq(contacts.userId, domainUser.id), eq(contacts.channel, 'sms'), isNull(contacts.deletedAt)));
	await db
		.update(contacts)
		.set({ deletedAt: new Date() })
		.where(and(eq(contacts.channel, 'sms'), eq(contacts.value, phone), isNull(contacts.deletedAt), ne(contacts.userId, domainUser.id)));

	await db.insert(contacts).values({ userId: domainUser.id, channel: 'sms', value: phone, isPrimary: true, verifiedAt: new Date() });
	await db.update(users).set({ verified: { ...domainUser.verified, sms: true } }).where(eq(users.id, domainUser.id));
}

export const load: PageServerLoad = async (event) => {
	const { domainUser } = await requireDashboardUser(event);
	const next = safeNext(event.url.searchParams.get('next'));

	// The candidate number: the ?phone= param (whatever's typed on the account
	// page), or the one already on file if visited directly.
	const existing = await getSmsContact(domainUser.id);
	const raw = event.url.searchParams.get('phone');
	const phone = (raw ? normalizeKenyanPhone(raw) : null) ?? existing?.value ?? null;
	if (!phone) redirect(302, withNotice('/dashboard/account', 'Add an SMS phone number to your account first.'));

	if (phone === existing?.value && existing?.verifiedAt) {
		redirect(302, withNotice(next, 'Your SMS number is already verified.'));
	}
	if (await verifiedByOther(domainUser.id, phone)) {
		redirect(302, withNotice('/dashboard/account', 'That number is already verified on another account.'));
	}

	// Auto-send a code on arrival only if none is already outstanding for this
	// number — so a page refresh reuses the code already sent instead of firing a
	// new one. A later resend is a deliberate button click.
	let phoneCooldown = await otpCooldownRemaining('sms', phone);
	if (!(await hasPendingOtp('sms', phone))) {
		try {
			await sendOtp(domainUser.id, 'sms', phone);
			phoneCooldown = (await getPlatformSettings()).otpCooldownSeconds;
		} catch {
			// Best-effort — the "Resend code" button still lets them retry manually.
		}
	}

	return { next, phone, phoneCooldown };
};

export const actions: Actions = {
	sendPhoneCode: async (event) => {
		const { domainUser } = await requireDashboardUser(event);
		const form = await event.request.formData();
		const normalized = normalizeKenyanPhone(String(form.get('phone') ?? ''));
		if (!normalized) return fail(400, { phoneError: 'Enter a valid Kenyan phone number.' });
		if (await verifiedByOther(domainUser.id, normalized)) {
			return fail(400, { phoneError: 'This number is already verified on another account.' });
		}
		try {
			await sendOtp(domainUser.id, 'sms', normalized);
		} catch (error) {
			return fail(400, { phoneError: error instanceof Error ? error.message : 'Could not send code' });
		}
		return { phoneSent: true };
	},

	verifyCode: async (event) => {
		const { domainUser } = await requireDashboardUser(event);
		const form = await event.request.formData();
		const code = String(form.get('code') ?? '').trim();
		const next = safeNext(String(form.get('next') ?? '/dashboard/account'));
		if (!code) return fail(400, { codeError: 'Enter the code you received.' });

		const result = await verifyOtpWithDestination(domainUser.id, 'sms', code);
		if (!result.ok || !result.destination) return fail(400, { codeError: 'That code is invalid or expired.' });

		await applyPhoneVerified(domainUser, result.destination);
		redirect(302, withNotice(next, `You have successfully verified ${result.destination}`));
	}
};
