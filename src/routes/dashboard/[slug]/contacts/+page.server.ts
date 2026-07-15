import { fail } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { contacts, users } from '$lib/server/db/schema';
import { getRouteLeaderContext, ownVerifiedContacts, requireDashboardUser } from '$lib/server/dashboard';
import { normalizeKenyanPhone } from '$lib/utils/phone';
import type { Actions, PageServerLoad } from './$types';

// The subject is the leader profile being edited — a distinct (phantom) user from
// the signed-in account (see createPhantomUser in $lib/server/leader.ts), so this
// is the campaign's PUBLIC contact info, not the citizen's own login identity.
async function getSubject(event: Parameters<typeof requireDashboardUser>[0]) {
	const { domainUser } = await requireDashboardUser(event);
	const ctx = await getRouteLeaderContext(event, domainUser.id);
	return { subject: ctx?.profileUser ?? domainUser, domainUser };
}

export const load: PageServerLoad = async (event) => {
	const { subject, domainUser } = await getSubject(event);

	const contactRows = await db
		.select({ channel: contacts.channel, value: contacts.value, verifiedAt: contacts.verifiedAt })
		.from(contacts)
		.where(and(eq(contacts.userId, subject.id), isNull(contacts.deletedAt)));

	const email = contactRows.find((c) => c.channel === 'email');
	const sms = contactRows.find((c) => c.channel === 'sms');
	const whatsapp = contactRows.find((c) => c.channel === 'whatsapp');
	const socials = (subject.socials ?? {}) as Record<string, string>;
	const { website, ...otherSocials } = socials;

	// Contacts the editor already OTP-verified on their own citizen account count
	// as verified here too — typing one shows "✓ Verified" without another OTP.
	const own = await ownVerifiedContacts(domainUser.id);

	return {
		address: subject.address ?? '',
		sms: sms?.value ?? '',
		whatsapp: whatsapp?.value ?? '',
		email: email?.value ?? '',
		smsVerified: !!sms?.verifiedAt || own.check('sms', sms?.value ?? ''),
		whatsappVerified: !!whatsapp?.verifiedAt || own.check('whatsapp', whatsapp?.value ?? ''),
		emailVerified: !!email?.verifiedAt || own.check('email', email?.value ?? ''),
		ownVerified: own.lists,
		website: website ?? '',
		socials: otherSocials
	};
};

export const actions: Actions = {
	save: async (event) => {
		const { subject } = await getSubject(event);

		const form = await event.request.formData();
		const address = String(form.get('address') ?? '').trim();
		const sms = String(form.get('sms') ?? '').trim();
		const website = String(form.get('website') ?? '').trim();

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

		// A campaign's public contact lines (the leader profile, not a login) — saved
		// directly on change. A value live on ANY other account is rejected up front:
		// letting the insert collide with the (channel, value) unique index would
		// silently drop the new value after the old row was already soft-deleted.
		const replaceContact = async (channel: 'sms' | 'whatsapp' | 'email', value: string, label: string) => {
			const [existingContact] = await db
				.select({ id: contacts.id, value: contacts.value })
				.from(contacts)
				.where(and(eq(contacts.userId, subject.id), eq(contacts.channel, channel), isNull(contacts.deletedAt)));
			if (existingContact?.value === value) return null;

			if (value) {
				const [holder] = await db
					.select({ userId: contacts.userId })
					.from(contacts)
					.where(and(eq(contacts.channel, channel), eq(contacts.value, value), isNull(contacts.deletedAt)));
				if (holder && holder.userId !== subject.id) {
					return `That ${label} is already in use by another account.`;
				}
			}

			if (existingContact) {
				await db.update(contacts).set({ deletedAt: new Date() }).where(eq(contacts.id, existingContact.id));
			}
			if (value) {
				await db.insert(contacts).values({ userId: subject.id, channel, value, isPrimary: true }).onConflictDoNothing();
			}
			return null;
		};

		for (const channel of ['sms', 'whatsapp'] as const) {
			const raw = String(form.get(channel) ?? '').trim();
			// PhoneInput submits the local part (712345678); store the canonical 254… form.
			const value = raw ? (normalizeKenyanPhone(raw) ?? '') : '';
			if (raw && !value) return fail(400, { error: `Enter a valid Kenyan ${channel === 'sms' ? 'SMS' : 'WhatsApp'} number.` });
			const conflict = await replaceContact(channel, value, `${channel === 'sms' ? 'SMS' : 'WhatsApp'} number`);
			if (conflict) return fail(400, { error: conflict });
		}

		// The public contact email — like the phone lines, saved directly and left
		// UNVERIFIED (verifiedAt null); verifying via /verify/email is optional. An
		// unchanged value is skipped so an already-verified email keeps its verifiedAt.
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		if (email && !email.includes('@')) return fail(400, { error: 'Enter a valid email address.' });
		const emailConflict = await replaceContact('email', email, 'email address');
		if (emailConflict) return fail(400, { error: emailConflict });

		return { saved: true };
	}
};
