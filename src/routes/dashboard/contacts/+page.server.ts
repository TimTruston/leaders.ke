import { fail } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { contacts, users } from '$lib/server/db/schema';
import { requireDashboardUser } from '$lib/server/dashboard';
import { getLeaderContext } from '$lib/server/leader';
import { normalizeKenyanPhone } from '$lib/utils/phone';
import type { Actions, PageServerLoad } from './$types';

// The subject is the leader profile being edited — a distinct (phantom) user from
// the signed-in account (see createPhantomUser in $lib/server/leader.ts), so this
// is the campaign's PUBLIC contact info, not the citizen's own login identity.
async function getSubject(event: Parameters<typeof requireDashboardUser>[0]) {
	const { domainUser } = await requireDashboardUser(event);
	const ctx = await getLeaderContext(domainUser.id);
	return ctx?.profileUser ?? domainUser;
}

export const load: PageServerLoad = async (event) => {
	const subject = await getSubject(event);

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

		// A campaign's public phone lines (the leader profile, not a login) — saved
		// directly on change. Replace-on-change so the (channel, value) unique index
		// never collides with the number just left behind.
		for (const channel of ['sms', 'whatsapp'] as const) {
			const raw = String(form.get(channel) ?? '').trim();
			// PhoneInput submits the local part (712345678); store the canonical 254… form.
			const value = raw ? (normalizeKenyanPhone(raw) ?? '') : '';
			if (raw && !value) return fail(400, { error: `Enter a valid Kenyan ${channel === 'sms' ? 'SMS' : 'WhatsApp'} number.` });
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

		// The public contact email — like the phone lines, saved directly and left
		// UNVERIFIED (verifiedAt null); verifying via /verify/email is optional. An
		// unchanged value is skipped so an already-verified email keeps its verifiedAt.
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		if (email && !email.includes('@')) return fail(400, { error: 'Enter a valid email address.' });
		const [existingEmail] = await db
			.select({ id: contacts.id, value: contacts.value })
			.from(contacts)
			.where(and(eq(contacts.userId, subject.id), eq(contacts.channel, 'email'), isNull(contacts.deletedAt)));
		if (existingEmail?.value !== email) {
			if (existingEmail) {
				await db.update(contacts).set({ deletedAt: new Date() }).where(eq(contacts.id, existingEmail.id));
			}
			if (email) {
				await db.insert(contacts).values({ userId: subject.id, channel: 'email', value: email, isPrimary: true }).onConflictDoNothing();
			}
		}

		return { saved: true };
	}
};
