import { fail, redirect } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { contacts, users } from '$lib/server/db/schema';
import { requireDashboardUser } from '$lib/server/dashboard';
import { getLeaderContext } from '$lib/server/leader';
import { otpCooldownRemaining, sendOtp, verifyOtp, verifyOtpLinkToken } from '$lib/server/otp';
import type { Actions, PageServerLoad } from './$types';

async function getSubject(event: Parameters<typeof requireDashboardUser>[0]) {
	const { domainUser } = await requireDashboardUser(event);
	const ctx = await getLeaderContext(domainUser.id);
	return ctx?.profileUser ?? domainUser;
}

export const load: PageServerLoad = async (event) => {
	const subject = await getSubject(event);

	const linkToken = event.url.searchParams.get('linkToken');
	if (linkToken) {
		const result = await verifyOtpLinkToken(linkToken);
		if (result?.userId === subject.id) {
			await db
				.update(contacts)
				.set({ verifiedAt: new Date() })
				.where(and(eq(contacts.userId, subject.id), eq(contacts.channel, 'email'), isNull(contacts.deletedAt)));
			redirect(302, '/dashboard/contacts');
		}
	}

	const contactRows = await db
		.select({ channel: contacts.channel, value: contacts.value, verifiedAt: contacts.verifiedAt })
		.from(contacts)
		.where(and(eq(contacts.userId, subject.id), isNull(contacts.deletedAt)));

	const email = contactRows.find((c) => c.channel === 'email');
	const socials = (subject.socials ?? {}) as Record<string, string>;
	const { website, ...otherSocials } = socials;

	return {
		address: subject.address ?? '',
		sms: contactRows.find((c) => c.channel === 'sms')?.value ?? '',
		whatsapp: contactRows.find((c) => c.channel === 'whatsapp')?.value ?? '',
		email: email?.value ?? '',
		emailVerified: !!email?.verifiedAt,
		emailCooldown: email?.value ? await otpCooldownRemaining('email', email.value) : 0,
		website: website ?? '',
		socials: otherSocials
	};
};

export const actions: Actions = {
	save: async (event) => {
		const subject = await getSubject(event);

		const form = await event.request.formData();
		const address = String(form.get('address') ?? '').trim();
		const sms = String(form.get('sms') ?? '').trim();
		const website = String(form.get('website') ?? '').trim();

		const missingFields: string[] = [];
		if (!address) missingFields.push('address');
		if (!sms) missingFields.push('sms');
		if (missingFields.length > 0) {
			return fail(400, { error: 'Fill in the highlighted fields before saving.', missingFields });
		}

		let socialEntries: { kind: string; value: string }[] = [];
		try {
			socialEntries = JSON.parse(String(form.get('socialEntries') ?? '[]'));
		} catch {
			return fail(400, { error: 'Could not read the social links.' });
		}

		const socials: Record<string, string> = {};
		for (const s of socialEntries) if (s.value?.trim()) socials[s.kind] = s.value.trim();
		if (website) socials.website = website;

		await db.update(users).set({ address: address || null, socials }).where(eq(users.id, subject.id));

		// Email is handled by its own send-code/verify-code actions below, not here —
		// silently overwriting it on every autosave is what wiped it out last time.
		for (const channel of ['sms', 'whatsapp'] as const) {
			const value = String(form.get(channel) ?? '').trim();
			const [existingContact] = await db
				.select({ id: contacts.id, value: contacts.value })
				.from(contacts)
				.where(and(eq(contacts.userId, subject.id), eq(contacts.channel, channel), isNull(contacts.deletedAt)));
			if (existingContact?.value === value) continue;
			if (existingContact) {
				await db.update(contacts).set({ deletedAt: new Date() }).where(eq(contacts.id, existingContact.id));
			}
			if (value) {
				await db.insert(contacts).values({ userId: subject.id, channel, value, isPrimary: true }).onConflictDoNothing();
			}
		}

		return { saved: true };
	},

	sendEmailCode: async (event) => {
		const subject = await getSubject(event);
		const form = await event.request.formData();
		const email = String(form.get('email') ?? '').trim();
		if (!email) return fail(400, { emailError: 'Enter an email address.' });

		const [existing] = await db
			.select({ id: contacts.id, value: contacts.value })
			.from(contacts)
			.where(and(eq(contacts.userId, subject.id), eq(contacts.channel, 'email'), isNull(contacts.deletedAt)));
		if (existing && existing.value !== email) {
			await db.update(contacts).set({ deletedAt: new Date() }).where(eq(contacts.id, existing.id));
		}
		if (!existing || existing.value !== email) {
			await db.insert(contacts).values({ userId: subject.id, channel: 'email', value: email, isPrimary: true }).onConflictDoNothing();
		}

		try {
			await sendOtp(subject.id, 'email', email, subject.firstName, '/dashboard/contacts');
		} catch (error) {
			return fail(400, { emailError: error instanceof Error ? error.message : 'Could not send code' });
		}
		return { emailSent: true };
	},

	verifyEmailCode: async (event) => {
		const subject = await getSubject(event);
		const form = await event.request.formData();
		const code = String(form.get('code') ?? '').trim();
		if (!code) return fail(400, { codeError: 'Enter the code you received.' });

		const ok = await verifyOtp(subject.id, 'email', code);
		if (!ok) return fail(400, { codeError: 'That code is invalid or expired.' });

		await db
			.update(contacts)
			.set({ verifiedAt: new Date() })
			.where(and(eq(contacts.userId, subject.id), eq(contacts.channel, 'email'), isNull(contacts.deletedAt)));

		return { emailVerified: true };
	}
};
