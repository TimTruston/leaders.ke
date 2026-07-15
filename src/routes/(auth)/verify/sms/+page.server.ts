import { fail } from '@sveltejs/kit';
import { redirectWithFlash } from '$lib/server/flash';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { contacts, users } from '$lib/server/db/schema';
import { parseScope, resolveVerifySubject, type DashboardUser } from '$lib/server/dashboard';
import { stageClaimVerifiedContact } from '$lib/server/claims';
import { normalizeKenyanPhone } from '$lib/utils/phone';
import { hasPendingOtp, otpCooldownRemaining, sendOtp, verifyOtpWithDestination } from '$lib/server/otp';
import { getPlatformSettings } from '$lib/server/settings';
import type { Actions, PageServerLoad } from './$types';

// Only ever redirect to a same-origin relative path — never follow ?next anywhere else.
function safeNext(next: string | null): string {
	return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

async function getSmsContact(userId: number) {
	const [row] = await db
		.select({ value: contacts.value, verifiedAt: contacts.verifiedAt })
		.from(contacts)
		.where(and(eq(contacts.userId, userId), eq(contacts.channel, 'sms'), isNull(contacts.deletedAt)));
	return row ?? null;
}

/** A hold only blocks when it is *verified* AND belongs to neither the subject
 * nor the editor - the editor's own citizen contacts are theirs to reuse on any
 * profile they manage. */
async function verifiedByOther(ownerIds: number[], phone: string): Promise<boolean> {
	const [held] = await db
		.select({ userId: contacts.userId, verifiedAt: contacts.verifiedAt })
		.from(contacts)
		.where(and(eq(contacts.channel, 'sms'), eq(contacts.value, phone), isNull(contacts.deletedAt)))
		.limit(1);
	return !!(held && !ownerIds.includes(held.userId) && held.verifiedAt);
}

// A confirmed number becomes the account's single verified SMS contact.
async function applyPhoneVerified(subject: DashboardUser['domainUser'], phone: string) {
	await db
		.update(contacts)
		.set({ deletedAt: new Date() })
		.where(and(eq(contacts.userId, subject.id), eq(contacts.channel, 'sms'), isNull(contacts.deletedAt)));
	await db
		.update(contacts)
		.set({ deletedAt: new Date() })
		.where(and(eq(contacts.channel, 'sms'), eq(contacts.value, phone), isNull(contacts.deletedAt), ne(contacts.userId, subject.id)));

	await db.insert(contacts).values({ userId: subject.id, channel: 'sms', value: phone, isPrimary: true, verifiedAt: new Date() });
	await db.update(users).set({ verified: { ...subject.verified, sms: true } }).where(eq(users.id, subject.id));
}

export const load: PageServerLoad = async (event) => {
	const scope = parseScope(event.url.searchParams.get('scope'));
	const slug = event.url.searchParams.get('slug');
	const { domainUser, subject } = await resolveVerifySubject(event, scope, slug);
	const next = safeNext(event.url.searchParams.get('next'));

	// The candidate number: the ?phone= param (whatever's typed on the account
	// page), or the one already on file if visited directly.
	const existing = await getSmsContact(subject.id);
	const raw = event.url.searchParams.get('phone');
	const phone = (raw ? normalizeKenyanPhone(raw) : null) ?? existing?.value ?? null;
	if (!phone) redirectWithFlash(event.cookies, next, 'Add an SMS phone number to your account first.');

	// Claim scope only proves the claimant controls the number (staged in the
	// claim evidence), so another account's hold on it is no obstacle.
	if (scope !== 'claim') {
		if (phone === existing?.value && existing?.verifiedAt) {
			redirectWithFlash(event.cookies, next, 'Your SMS number is already verified.');
		}
		if (await verifiedByOther([subject.id, domainUser.id], phone)) {
			redirectWithFlash(event.cookies, next, 'That number is already verified on another account.');
		}
	}

	// Auto-send a code on arrival only if none is already outstanding for this
	// number — so a page refresh reuses the code already sent instead of firing a
	// new one. A later resend is a deliberate button click.
	let phoneCooldown = await otpCooldownRemaining('sms', phone);
	if (!(await hasPendingOtp('sms', phone))) {
		try {
			await sendOtp(subject.id, 'sms', phone);
			phoneCooldown = (await getPlatformSettings()).otpCooldownSeconds;
		} catch {
			// Best-effort — the "Resend code" button still lets them retry manually.
		}
	}

	return { next, scope, slug, phone, phoneCooldown };
};

export const actions: Actions = {
	sendPhoneCode: async (event) => {
		const form = await event.request.formData();
		const scope = parseScope(String(form.get('scope') ?? ''));
		const { domainUser, subject } = await resolveVerifySubject(event, scope, String(form.get('slug') ?? '') || null);
		const normalized = normalizeKenyanPhone(String(form.get('phone') ?? ''));
		if (!normalized) return fail(400, { phoneError: 'Enter a valid Kenyan phone number.' });
		if (scope !== 'claim' && (await verifiedByOther([subject.id, domainUser.id], normalized))) {
			return fail(400, { phoneError: 'This number is already verified on another account.' });
		}
		try {
			await sendOtp(subject.id, 'sms', normalized);
		} catch (error) {
			return fail(400, { phoneError: error instanceof Error ? error.message : 'Could not send code' });
		}
		return { phoneSent: true };
	},

	verifyCode: async (event) => {
		const form = await event.request.formData();
		const scope = parseScope(String(form.get('scope') ?? ''));
		const slug = String(form.get('slug') ?? '') || null;
		const { domainUser, subject } = await resolveVerifySubject(event, scope, slug);
		const code = String(form.get('code') ?? '').trim();
		const next = safeNext(String(form.get('next') ?? '/dashboard/account'));
		if (!code) return fail(400, { codeError: 'Enter the code you received.' });

		const result = await verifyOtpWithDestination(subject.id, 'sms', code);
		if (!result.ok || !result.destination) return fail(400, { codeError: 'That code is invalid or expired.' });

		// Claim scope: record the proof inside the claim's staged evidence — never
		// on the citizen's own contacts or the real profile.
		if (scope === 'claim' && slug) {
			await stageClaimVerifiedContact(slug, domainUser.id, 'sms', result.destination);
		} else {
			await applyPhoneVerified(subject, result.destination);
		}
		redirectWithFlash(event.cookies, next, `You have successfully verified ${result.destination}`);
	}
};
