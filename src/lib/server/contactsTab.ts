// The Contacts section embedded on the Profile tab (contacts belong to the person,
// so they save alongside the profile). Two variants share ContactsTab.svelte:
// - loadContactsTab/saveContactsTab: apply + campaign families — writes the person's
//   real contacts (the phantom users row) directly.
// - loadClaimContactsTab/saveClaimContactsTab: claim family — stages into the pending
//   claim's evidence; the real profile is untouched until an admin approves.
import { fail, type RequestEvent } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { contacts, users } from '$lib/server/db/schema';
import { resolveClaimRequest, stageClaimEvidence, type ClaimEvidence } from '$lib/server/claims';
import { getRouteLeaderContext, ownVerifiedContacts, requireDashboardUser } from '$lib/server/dashboard';
import { PLATFORMS } from '$lib/components/contact/socials';
import { normalizeKenyanPhone } from '$lib/utils/phone';

/** The client stages each social entry as a bare handle (ContactsTab.svelte's
 * handleSocialInput strips a pasted full URL down to one) — reconstruct the full
 * URL here so ContactLinks.svelte (which uses the stored value as an href
 * directly, no prefix logic of its own) actually links somewhere real. */
function buildSocialsRecord(entries: { kind: string; value: string }[], website: string): Record<string, string> {
	const socials: Record<string, string> = {};
	for (const s of entries) {
		const value = s.value?.trim();
		if (!value) continue;
		const platform = PLATFORMS.find((p) => p.kind === s.kind);
		socials[s.kind] = platform ? `https://${platform.prefix}${value}` : value;
	}
	if (website) socials.website = /^https?:\/\//i.test(website) ? website : `https://${website}`;
	return socials;
}

// The subject is the leader profile being edited — a distinct (phantom) user from
// the signed-in account, so this is the campaign's PUBLIC contact info, not the
// citizen's own login identity.
async function getSubject(event: RequestEvent) {
	const { domainUser } = await requireDashboardUser(event);
	const ctx = await getRouteLeaderContext(event, domainUser.id);
	return { subject: ctx?.profileUser ?? domainUser, domainUser };
}

export async function loadContactsTab(event: RequestEvent) {
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
}

export async function saveContactsTab(event: RequestEvent) {
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

	const socials = buildSocialsRecord(socialEntries, website);

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

export async function loadClaimContactsTab(event: RequestEvent) {
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
}

export async function saveClaimContactsTab(event: RequestEvent) {
	const { domainUser, resolved, claim } = await resolveClaimRequest(event);
	const staged = (claim?.evidence as ClaimEvidence | null)?.contacts;

	const form = await event.request.formData();
	const address = String(form.get('address') ?? '').trim();
	const websiteRaw = String(form.get('website') ?? '').trim();
	const website = websiteRaw && !/^https?:\/\//i.test(websiteRaw) ? `https://${websiteRaw}` : websiteRaw;
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
	for (const s of socialEntries) {
		const value = s.value?.trim();
		if (!value) continue;
		const platform = PLATFORMS.find((p) => p.kind === s.kind);
		socials[s.kind] = platform ? `https://${platform.prefix}${value}` : value;
	}

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
