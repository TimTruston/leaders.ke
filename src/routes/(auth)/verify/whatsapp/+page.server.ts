import { fail, redirect } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { contacts, users } from '$lib/server/db/schema';
import { parseScope, resolveVerifySubject, type DashboardUser } from '$lib/server/dashboard';
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

/** Only another account's *verified* hold blocks a claim; an unverified one is fair game. */
async function verifiedByOther(userId: number, number: string): Promise<boolean> {
	const [held] = await db
		.select({ userId: contacts.userId, verifiedAt: contacts.verifiedAt })
		.from(contacts)
		.where(and(eq(contacts.channel, 'whatsapp'), eq(contacts.value, number), isNull(contacts.deletedAt)))
		.limit(1);
	return !!(held && held.userId !== userId && held.verifiedAt);
}

// Unlike sms/email (one live value per account), a person can keep several WhatsApp
// numbers — so this only adds/verifies the given number, never removes the others.
async function applyNumberVerified(subject: DashboardUser['domainUser'], number: string) {
	// Drop only this exact value's rows (this user's own re-verify, or another
	// account's *unverified* hold) so the (channel, value) unique index can't collide.
	await db
		.update(contacts)
		.set({ deletedAt: new Date() })
		.where(and(eq(contacts.channel, 'whatsapp'), eq(contacts.value, number), isNull(contacts.deletedAt)));
	await db.insert(contacts).values({ userId: subject.id, channel: 'whatsapp', value: number, verifiedAt: new Date() });
	// `verified.whatsapp` means "at least one WhatsApp number is verified".
	await db.update(users).set({ verified: { ...subject.verified, whatsapp: true } }).where(eq(users.id, subject.id));
}

export const load: PageServerLoad = async (event) => {
	const scope = parseScope(event.url.searchParams.get('scope'));
	const { subject } = await resolveVerifySubject(event, scope);
	const next = safeNext(event.url.searchParams.get('next'));

	const raw = event.url.searchParams.get('number');
	const number = raw ? normalizeKenyanPhone(raw) : null;
	if (!number) redirect(302, withNotice('/dashboard/account', 'Enter a WhatsApp number to verify.'));

	const [existing] = await db
		.select({ verifiedAt: contacts.verifiedAt })
		.from(contacts)
		.where(and(eq(contacts.userId, subject.id), eq(contacts.channel, 'whatsapp'), eq(contacts.value, number), isNull(contacts.deletedAt)));
	if (existing?.verifiedAt) redirect(302, withNotice(next, `${number} is already verified.`));
	if (await verifiedByOther(subject.id, number)) {
		redirect(302, withNotice('/dashboard/account', 'That number is already verified on another account.'));
	}

	// Auto-send a code on arrival only if none is already outstanding for this
	// number — so a page refresh reuses the code already sent instead of firing a
	// new one. A later resend is a deliberate button click.
	let phoneCooldown = await otpCooldownRemaining('whatsapp', number);
	if (!(await hasPendingOtp('whatsapp', number))) {
		try {
			await sendOtp(subject.id, 'whatsapp', number);
			phoneCooldown = (await getPlatformSettings()).otpCooldownSeconds;
		} catch {
			// Best-effort — the "Resend code" button still lets them retry manually.
		}
	}

	return { next, scope, phone: number, phoneCooldown };
};

export const actions: Actions = {
	sendPhoneCode: async (event) => {
		const form = await event.request.formData();
		const { subject } = await resolveVerifySubject(event, parseScope(String(form.get('scope') ?? '')));
		const normalized = normalizeKenyanPhone(String(form.get('phone') ?? ''));
		if (!normalized) return fail(400, { phoneError: 'Enter a valid Kenyan phone number.' });
		if (await verifiedByOther(subject.id, normalized)) {
			return fail(400, { phoneError: 'This number is already verified on another account.' });
		}
		try {
			// Stub: no WhatsApp Business API yet — reuses the same gateway/console stub
			// as SMS (see sendOtp -> sendSms).
			await sendOtp(subject.id, 'whatsapp', normalized);
		} catch (error) {
			return fail(400, { phoneError: error instanceof Error ? error.message : 'Could not send code' });
		}
		return { phoneSent: true };
	},

	verifyCode: async (event) => {
		const form = await event.request.formData();
		const { subject } = await resolveVerifySubject(event, parseScope(String(form.get('scope') ?? '')));
		const code = String(form.get('code') ?? '').trim();
		const next = safeNext(String(form.get('next') ?? '/dashboard/account'));
		if (!code) return fail(400, { codeError: 'Enter the code you received.' });

		const result = await verifyOtpWithDestination(subject.id, 'whatsapp', code);
		if (!result.ok || !result.destination) return fail(400, { codeError: 'That code is invalid or expired.' });

		await applyNumberVerified(subject, result.destination);
		redirect(302, withNotice(next, `You have successfully verified ${result.destination}`));
	}
};
