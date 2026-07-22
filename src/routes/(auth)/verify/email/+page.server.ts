import { fail } from '@sveltejs/kit';
import { redirectWithFlash } from '$lib/server/flash';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { contacts, user, users } from '$lib/server/db/schema';
import { parseScope, resolveVerifySubject, type DashboardUser } from '$lib/server/dashboard';
import { stageClaimVerifiedContact } from '$lib/server/claims';
import { hasPendingOtp, otpCooldownRemaining, sendOtp, verifyOtpWithDestination, verifyOtpLinkToken } from '$lib/server/otp';
import { getPlatformSettings } from '$lib/server/settings';
import type { Actions, PageServerLoad } from './$types';

// Only ever redirect to a same-origin relative path — never follow ?next anywhere else.
function safeNext(next: string | null): string {
	return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

/** The candidate email to verify: the ?email= param (e.g. an inline change on the
 * account page) or, when absent, the account's current login email (post-signup). */
function candidateEmail(url: URL, authEmail: string): string {
	const raw = url.searchParams.get('email')?.trim().toLowerCase();
	return raw && raw.includes('@') ? raw : authEmail;
}

/** A hold only blocks when it is *verified* AND belongs to neither the subject
 * nor the editor - the editor's own citizen contacts are theirs to reuse on any
 * profile they manage. */
async function verifiedByOther(ownerIds: number[], email: string): Promise<boolean> {
	const [held] = await db
		.select({ userId: contacts.userId, verifiedAt: contacts.verifiedAt })
		.from(contacts)
		.where(and(eq(contacts.channel, 'email'), eq(contacts.value, email), isNull(contacts.deletedAt)))
		.limit(1);
	return !!(held && !ownerIds.includes(held.userId) && held.verifiedAt);
}

// A confirmed email becomes the account's login email + verified contact, and flips
// every place verification is tracked: the denormalized `users.verified` cache and
// better-auth's own `user`. Handles both post-signup (email === current) and an
// inline change (email differs — the login email moves to the new address).
async function applyEmailVerified(subject: DashboardUser['domainUser'], email: string, syncAuth: boolean) {
	// Drop this user's prior live email row and any other account's *unverified* hold
	// of the new value, so the (channel, value) unique index can't collide on insert.
	await db
		.update(contacts)
		.set({ deletedAt: new Date() })
		.where(and(eq(contacts.userId, subject.id), eq(contacts.channel, 'email'), isNull(contacts.deletedAt)));
	await db
		.update(contacts)
		.set({ deletedAt: new Date() })
		.where(and(eq(contacts.channel, 'email'), eq(contacts.value, email), isNull(contacts.deletedAt), ne(contacts.userId, subject.id)));

	await db.insert(contacts).values({ userId: subject.id, channel: 'email', value: email, isPrimary: true, verifiedAt: new Date() });
	await db.update(users).set({ verified: { ...subject.verified, email: true } }).where(eq(users.id, subject.id));
	// Only the citizen's own account has a real login: a leader profile is a phantom
	// user that never signs in, so its better-auth email stays the placeholder.
	if (syncAuth) {
		await db.update(user).set({ email, emailVerified: true }).where(eq(user.id, subject.authUserId));
	}
}

export const load: PageServerLoad = async (event) => {
	const scope = parseScope(event.url.searchParams.get('scope'));
	const slug = event.url.searchParams.get('slug');
	const { authUser, domainUser, subject } = await resolveVerifySubject(event, scope, slug);
	const next = safeNext(event.url.searchParams.get('next'));
	const email = candidateEmail(event.url, authUser.email);
	const isAccount = subject.id === domainUser.id;

	// Click-through link from the email itself (carries scope so it resolves the same subject).
	const linkToken = event.url.searchParams.get('linkToken');
	if (linkToken) {
		const result = await verifyOtpLinkToken(linkToken);
		if (result && result.userId === subject.id) {
			if (scope === 'claim' && slug) {
				await stageClaimVerifiedContact(slug, domainUser.id, 'email', result.destination);
			} else {
				await applyEmailVerified(subject, result.destination, isAccount);
			}
			redirectWithFlash(event.cookies, next, `${result.destination} verified.`);
		}
	}

	// Claim scope only proves the claimant controls the address (staged in the
	// claim evidence), so existing holds on it are no obstacle.
	if (scope !== 'claim') {
		// Verifying the citizen's current login email that's already verified — nothing to do.
		if (isAccount && email === authUser.email && domainUser.verified.email) {
			redirectWithFlash(event.cookies, next, `${email} is already verified.`);
		}
		if (await verifiedByOther([subject.id, domainUser.id], email)) {
			redirectWithFlash(event.cookies, next, `${email} is already verified on another account.`);
		}
	}

	// Auto-send a code on arrival only if none is already outstanding for this
	// address — so a page refresh reuses the code already sent instead of firing a
	// new one. A later resend is a deliberate button click.
	const linkPath = scope === 'account' ? '/verify/email' : `/verify/email?scope=${scope}${slug ? `&slug=${slug}` : ''}`;
	let emailCooldown = await otpCooldownRemaining('email', email);
	if (!(await hasPendingOtp('email', email))) {
		try {
			await sendOtp(subject.id, 'email', email, subject.firstName, linkPath);
			emailCooldown = (await getPlatformSettings()).otpCooldownSeconds;
		} catch {
			// Best-effort — the "Resend code" button still lets them retry manually.
		}
	}

	return { next, scope, slug, email, emailCooldown };
};

export const actions: Actions = {
	sendEmailCode: async (event) => {
		const form = await event.request.formData();
		const scope = parseScope(String(form.get('scope') ?? ''));
		const slug = String(form.get('slug') ?? '') || null;
		const { authUser, domainUser, subject } = await resolveVerifySubject(event, scope, slug);
		const typed = String(form.get('email') ?? '').trim().toLowerCase();
		const email = typed.includes('@') ? typed : authUser.email;
		if (scope !== 'claim' && (await verifiedByOther([subject.id, domainUser.id], email))) {
			return fail(400, { emailError: `${email} is already verified on another account.` });
		}
		const linkPath = scope === 'account' ? '/verify/email' : `/verify/email?scope=${scope}${slug ? `&slug=${slug}` : ''}`;
		try {
			await sendOtp(subject.id, 'email', email, subject.firstName, linkPath);
		} catch (error) {
			return fail(400, { emailError: error instanceof Error ? error.message : 'Could not send code' });
		}
		return { emailSent: true };
	},

	verifyCode: async (event) => {
		const form = await event.request.formData();
		const scope = parseScope(String(form.get('scope') ?? ''));
		const slug = String(form.get('slug') ?? '') || null;
		const { domainUser, subject } = await resolveVerifySubject(event, scope, slug);
		const code = String(form.get('code') ?? '').trim();
		const next = safeNext(String(form.get('next') ?? '/dashboard/account'));
		if (!code) return fail(400, { codeError: 'Enter the code you received.' });

		const result = await verifyOtpWithDestination(subject.id, 'email', code);
		if (!result.ok || !result.destination) return fail(400, { codeError: 'That code is invalid or expired.' });

		// Claim scope: record the proof inside the claim's staged evidence — never
		// on the citizen's own contacts or the real profile.
		if (scope === 'claim' && slug) {
			await stageClaimVerifiedContact(slug, domainUser.id, 'email', result.destination);
		} else {
			await applyEmailVerified(subject, result.destination, subject.id === domainUser.id);
		}
		redirectWithFlash(event.cookies, next, `You have successfully verified ${result.destination}`);
	}
};
