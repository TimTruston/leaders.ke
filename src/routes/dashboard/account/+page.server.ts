import { fail } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { contacts, users } from '$lib/server/db/schema';
import { user as authUsers } from '$lib/server/db/auth.schema';
import { ownVerifiedContacts, requireDashboardUser } from '$lib/server/dashboard';
import { normalizeKenyanPhone } from '$lib/utils/phone';
import type { Actions, PageServerLoad } from './$types';

type NotificationPrefs = { email: boolean; sms: boolean; whatsapp: boolean };

export const load: PageServerLoad = async (event) => {
	const { domainUser, authUser } = await requireDashboardUser(event);

	const contactRows = await db
		.select({ channel: contacts.channel, value: contacts.value })
		.from(contacts)
		.where(and(eq(contacts.userId, domainUser.id), isNull(contacts.deletedAt)));
	return {
		email: authUser.email,
		firstName: domainUser.firstName,
		otherNames: domainUser.otherNames,
		smsPhone: contactRows.find((c) => c.channel === 'sms')?.value ?? '',
		whatsappPhone: contactRows.find((c) => c.channel === 'whatsapp')?.value ?? '',
		notificationPrefs: domainUser.notificationPrefs as NotificationPrefs,
		verified: domainUser.verified,
		// Values already OTP-verified on this account: re-typing one shows
		// "✓ Verified" immediately instead of offering another round-trip.
		ownVerified: (await ownVerifiedContacts(domainUser.id)).lists
	};
};

/** The account's currently-stored value for a contact channel (or '' if none). */
async function storedContact(userId: number, channel: 'sms' | 'whatsapp'): Promise<string> {
	const [existing] = await db
		.select({ value: contacts.value })
		.from(contacts)
		.where(and(eq(contacts.userId, userId), eq(contacts.channel, channel), isNull(contacts.deletedAt)));
	return existing?.value ?? '';
}

export const actions: Actions = {
	// Contact channels (email/sms/whatsapp) are never written here — a new value only
	// takes effect after a code is confirmed on /verify/[channel]. This save only
	// touches fields that don't need verifying, and refuses to proceed if the user
	// typed a new (unverified) number without going through Verify first.
	save: async (event) => {
		const { domainUser, authUser } = await requireDashboardUser(event);
		const form = await event.request.formData();
		const firstName = String(form.get('firstName') ?? '').trim();
		const otherNames = String(form.get('otherNames') ?? '').trim();
		const smsPhoneInput = String(form.get('smsPhone') ?? '').trim();
		const whatsappPhoneInput = String(form.get('whatsappPhone') ?? '').trim();
		const notificationPrefs: NotificationPrefs = {
			email: form.get('notifyEmail') === 'on',
			sms: form.get('notifySms') === 'on',
			whatsapp: form.get('notifyWhatsapp') === 'on'
		};

		if (!firstName || /\s/.test(firstName)) {
			return fail(400, { error: 'First name is required and must be a single word.' });
		}
		if (!otherNames) return fail(400, { error: 'Other names are required.' });

		// Compare the submitted numbers against what's on file (normalized both ways).
		// A changed value means they edited but didn't verify — block until they do.
		const smsPhone = smsPhoneInput ? normalizeKenyanPhone(smsPhoneInput) : '';
		if (smsPhoneInput && !smsPhone) return fail(400, { error: 'Enter a valid Kenyan number for SMS.' });
		const whatsappPhone = whatsappPhoneInput ? normalizeKenyanPhone(whatsappPhoneInput) : '';
		if (whatsappPhoneInput && !whatsappPhone) return fail(400, { error: 'Enter a valid Kenyan number for WhatsApp.' });

		if ((smsPhone || '') !== (await storedContact(domainUser.id, 'sms'))) {
			return fail(400, { error: 'Verify your new SMS number (tap Verify) before saving.' });
		}
		if ((whatsappPhone || '') !== (await storedContact(domainUser.id, 'whatsapp'))) {
			return fail(400, { error: 'Verify your new WhatsApp number (tap Verify) before saving.' });
		}

		await db.update(users).set({ firstName, otherNames, notificationPrefs }).where(eq(users.id, domainUser.id));
		// better-auth keeps its own `name` (shown in the global header) separate from
		// our firstName/otherNames — sync it here so the two never drift apart again.
		await db.update(authUsers).set({ name: `${firstName} ${otherNames}`.trim() }).where(eq(authUsers.id, authUser.id));

		return { saved: true };
	}
};
