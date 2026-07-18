// Claim-family Contacts tab: same form as apply/campaign (ContactsTab), but
// saves stage into the pending claim's evidence — the public profile's real
// contacts are untouched until an admin approves the claim.
import { fail } from '@sveltejs/kit';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { contacts } from '$lib/server/db/schema';
import { resolveClaimRequest, stageClaimEvidence, type ClaimEvidence } from '$lib/server/claims';
import { ownVerifiedContacts } from '$lib/server/dashboard';
import { normalizeKenyanPhone } from '$lib/utils/phone';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { domainUser, resolved, claim } = await resolveClaimRequest(event);
	const staged = (claim?.evidence as ClaimEvidence | null)?.contacts;

	// Prefill from the profile's public contacts when nothing is staged yet.
	const contactRows = await db
		.select({ channel: contacts.channel, value: contacts.value })
		.from(contacts)
		.where(and(eq(contacts.userId, resolved.row.users.id), isNull(contacts.deletedAt)));
	const socials = (resolved.row.users.socials ?? {}) as Record<string, string>;
	const { website, ...otherSocials } = socials;

	const own = await ownVerifiedContacts(domainUser.id);
	const sms = staged?.sms ?? contactRows.find((c) => c.channel === 'sms')?.value ?? '';
	const whatsapp = staged?.whatsapp ?? contactRows.find((c) => c.channel === 'whatsapp')?.value ?? '';
	const email = staged?.email ?? contactRows.find((c) => c.channel === 'email')?.value ?? '';

	return {
		// Verify links OTP the typed destination and stage the proof inside the
		// claim's evidence (scope=claim) — the real profile's contacts stay untouched.
		verifyScope: 'claim',
		address: staged?.address ?? resolved.row.users.address ?? '',
		sms,
		whatsapp,
		email,
		smsVerified: (staged?.smsVerified ?? false) || own.check('sms', sms),
		whatsappVerified: (staged?.whatsappVerified ?? false) || own.check('whatsapp', whatsapp),
		emailVerified: (staged?.emailVerified ?? false) || own.check('email', email),
		// The claimant's own already-verified contacts: typing one of these shows
		// "✓ Verified" immediately (no second OTP round-trip for a proven contact).
		ownVerified: own.lists,
		website: staged?.website ?? website ?? '',
		socials: staged?.socials ?? otherSocials
	};
};

export const actions: Actions = {
	save: async (event) => {
		const { domainUser, resolved, claim } = await resolveClaimRequest(event);
		const staged = (claim?.evidence as ClaimEvidence | null)?.contacts;

		const form = await event.request.formData();
		const address = String(form.get('address') ?? '').trim();
		const website = String(form.get('website') ?? '').trim();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		if (email && !email.includes('@')) return fail(400, { error: 'Enter a valid email address.' });

		// PhoneInput submits the local part (712345678); stage the canonical 254… form.
		const phones: Record<'sms' | 'whatsapp', string> = { sms: '', whatsapp: '' };
		for (const channel of ['sms', 'whatsapp'] as const) {
			const raw = String(form.get(channel) ?? '').trim();
			const value = raw ? (normalizeKenyanPhone(raw) ?? '') : '';
			if (raw && !value) return fail(400, { error: `Enter a valid Kenyan ${channel === 'sms' ? 'SMS' : 'WhatsApp'} number.` });
			phones[channel] = value;
		}

		let socialEntries: { kind: string; value: string }[] = [];
		try {
			socialEntries = JSON.parse(String(form.get('socialEntries') ?? '[]'));
		} catch {
			return fail(400, { error: 'Could not read the social links.' });
		}
		const socials: Record<string, string> = {};
		for (const s of socialEntries) if (s.value?.trim()) socials[s.kind] = s.value.trim();

		await stageClaimEvidence(resolved.row.users.id, domainUser.id, {
			contacts: {
				address,
				sms: phones.sms,
				whatsapp: phones.whatsapp,
				email,
				website,
				socials,
				// An OTP proof only holds for the exact destination it was sent to —
				// editing a value drops its verified flag.
				smsVerified: phones.sms === staged?.sms ? (staged?.smsVerified ?? false) : false,
				whatsappVerified: phones.whatsapp === staged?.whatsapp ? (staged?.whatsappVerified ?? false) : false,
				emailVerified: email === staged?.email ? (staged?.emailVerified ?? false) : false
			}
		});
		return { saved: true };
	}
};
