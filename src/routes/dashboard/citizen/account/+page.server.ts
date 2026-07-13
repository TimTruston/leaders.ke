import { fail } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { contacts, users } from '$lib/server/db/schema';
import { requireDashboardUser } from '$lib/server/dashboard';
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
		notificationPrefs: domainUser.notificationPrefs as NotificationPrefs
	};
};

/** Replaces this user's contact row for one channel, only touching the DB when the
 * value actually changed — keeps verifiedAt intact on a no-op save. */
async function replaceContact(userId: number, channel: 'sms' | 'whatsapp', value: string | null) {
	const [existing] = await db
		.select({ id: contacts.id, value: contacts.value })
		.from(contacts)
		.where(and(eq(contacts.userId, userId), eq(contacts.channel, channel), isNull(contacts.deletedAt)));
	if (existing?.value === value) return;

	if (existing) {
		await db.update(contacts).set({ deletedAt: new Date() }).where(eq(contacts.id, existing.id));
	}
	if (value) {
		await db.insert(contacts).values({ userId, channel, value, isPrimary: true }).onConflictDoNothing();
	}
}

export const actions: Actions = {
	save: async (event) => {
		const { domainUser } = await requireDashboardUser(event);
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

		const smsPhone = smsPhoneInput ? normalizeKenyanPhone(smsPhoneInput) : null;
		if (smsPhoneInput && !smsPhone) return fail(400, { error: 'Enter a valid Kenyan number for SMS.' });
		const whatsappPhone = whatsappPhoneInput ? normalizeKenyanPhone(whatsappPhoneInput) : null;
		if (whatsappPhoneInput && !whatsappPhone) return fail(400, { error: 'Enter a valid Kenyan number for WhatsApp.' });

		await db.update(users).set({ firstName, otherNames, notificationPrefs }).where(eq(users.id, domainUser.id));
		await replaceContact(domainUser.id, 'sms', smsPhone);
		await replaceContact(domainUser.id, 'whatsapp', whatsappPhone);

		return { saved: true };
	}
};
