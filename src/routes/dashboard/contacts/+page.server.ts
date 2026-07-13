import { fail } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { contacts, users } from '$lib/server/db/schema';
import { requireDashboardUser } from '$lib/server/dashboard';
import { getLeaderContext } from '$lib/server/leader';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { domainUser } = await requireDashboardUser(event);
	const ctx = await getLeaderContext(domainUser.id);
	const subject = ctx?.profileUser ?? domainUser;

	const contactRows = await db
		.select({ channel: contacts.channel, value: contacts.value })
		.from(contacts)
		.where(and(eq(contacts.userId, subject.id), isNull(contacts.deletedAt)));

	const socials = (subject.socials ?? {}) as Record<string, string>;
	const { website, ...otherSocials } = socials;

	return {
		address: subject.address ?? '',
		sms: contactRows.find((c) => c.channel === 'sms')?.value ?? '',
		whatsapp: contactRows.find((c) => c.channel === 'whatsapp')?.value ?? '',
		email: contactRows.find((c) => c.channel === 'email')?.value ?? '',
		website: website ?? '',
		socials: otherSocials
	};
};

export const actions: Actions = {
	save: async (event) => {
		const { domainUser } = await requireDashboardUser(event);
		const ctx = await getLeaderContext(domainUser.id);
		const subjectId = ctx?.profileUser.id ?? domainUser.id;

		const form = await event.request.formData();
		const address = String(form.get('address') ?? '').trim();
		const phone = String(form.get('phone') ?? '').trim();
		const email = String(form.get('email') ?? '').trim();
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

		await db.update(users).set({ address: address || null, socials }).where(eq(users.id, subjectId));

		// One contact row per channel: replace on change so the (channel, value) unique
		// index (scoped to live rows) never collides with the number/address just left behind.
		for (const [channel, value] of [
			['sms', phone],
			['email', email]
		] as const) {
			const [existingContact] = await db
				.select({ id: contacts.id, value: contacts.value })
				.from(contacts)
				.where(and(eq(contacts.userId, subjectId), eq(contacts.channel, channel), isNull(contacts.deletedAt)));
			if (existingContact?.value === value) continue; // unchanged - keep verifiedAt intact
			if (existingContact) {
				await db.update(contacts).set({ deletedAt: new Date() }).where(eq(contacts.id, existingContact.id));
			}
			if (value) {
				await db.insert(contacts).values({ userId: subjectId, channel, value, isPrimary: true }).onConflictDoNothing();
			}
		}

		return { saved: true };
	}
};
