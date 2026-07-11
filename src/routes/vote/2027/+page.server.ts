import { fail, redirect } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { ballotSimulations, leaders, pledges, users } from '$lib/server/db/schema';
import { counties, findCountyBySlug, findConstituencyBySlug, findWardBySlug } from '$lib/data/geo';
import { BALLOT_LEVELS, resolveCandidates, type BallotLevel } from '$lib/server/ballot';
import { fullName, getDomainUser, getOrCreateMainCampaign } from '$lib/server/leader';
import type { Actions, PageServerLoad } from './$types';

function publicId(): string {
	return randomBytes(6).toString('hex'); // 12 hex chars, matches ballotSimulations.publicId(12)
}

/** Anonymous device id for the long-lived 'anon_id' cookie: 32 hex chars. */
function anonDeviceId(): string {
	return randomBytes(16).toString('hex');
}

export const load: PageServerLoad = async ({ url }) => {
	const countySlug = url.searchParams.get('county') ?? '';
	const constituencySlug = url.searchParams.get('constituency') ?? '';
	const wardSlug = url.searchParams.get('ward') ?? '';

	const county = countySlug ? findCountyBySlug(countySlug) : undefined;
	const constituency = county && constituencySlug ? findConstituencyBySlug(constituencySlug) : undefined;
	const ward = constituency && wardSlug ? findWardBySlug(wardSlug) : undefined;

	const geoReady = !!(county && constituency && ward);

	const levels = geoReady
		? await Promise.all(
				BALLOT_LEVELS.map(async (level) => ({
					level,
					candidates: await resolveCandidates(level, { county: county!, constituency: constituency!, ward: ward! })
				}))
			)
		: [];

	return {
		countySlug,
		constituencySlug,
		wardSlug,
		countyName: county?.name ?? '',
		constituencyName: constituency?.name ?? '',
		wardName: ward?.name ?? '',
		geoReady,
		levels,
		countiesCount: counties.length
	};
};

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const county = form.get('county')?.toString() ?? '';
		const constituency = form.get('constituency')?.toString() ?? '';
		const ward = form.get('ward')?.toString() ?? '';
		const pollingStation = form.get('pollingStation')?.toString().trim() || null;
		const voterName = form.get('voterName')?.toString().trim() || null;
		const voterContact = form.get('voterContact')?.toString().trim() || null;
		const consentedToContact = form.get('consentedToContact') === 'on';
		const selectionsRaw = form.get('selections')?.toString() ?? '{}';

		if (!county || !constituency || !ward) {
			return fail(400, { message: 'Select your county, constituency and ward first.' });
		}

		let selections: Record<BallotLevel, string | null>;
		try {
			selections = JSON.parse(selectionsRaw);
		} catch {
			return fail(400, { message: 'Invalid ballot selections.' });
		}

		const hasAnySelection = BALLOT_LEVELS.some((level) => !!selections[level]);
		if (!hasAnySelection) {
			return fail(400, { message: 'Pick at least one candidate before casting your simulated vote.' });
		}

		const id = publicId();
		const [simulation] = await db
			.insert(ballotSimulations)
			.values({
				publicId: id,
				county,
				constituency,
				ward,
				pollingStation,
				selections,
				voterName,
				voterContact,
				consentedToContact
			})
			.returning({ id: ballotSimulations.id });

		// Every real-candidate pick ("db:<leaderId>") becomes a live vote pledge on
		// that leader's main campaign. Signed-in voters pledge by userId; anonymous
		// voters by the long-lived 'anon_id' device cookie.
		const domainUser = event.locals.user ? await getDomainUser(event.locals.user.id) : undefined;
		let anonId: string | null = null;
		if (!domainUser) {
			anonId = event.cookies.get('anon_id') ?? null;
			if (!anonId) {
				anonId = anonDeviceId();
				event.cookies.set('anon_id', anonId, {
					path: '/',
					httpOnly: true,
					maxAge: 60 * 60 * 24 * 365
				});
			}
		}

		// Abuse-detection metadata only, never identity.
		let ip: string | null = null;
		try {
			ip = event.getClientAddress();
		} catch {
			ip = null;
		}
		const userAgent = event.request.headers.get('user-agent')?.slice(0, 255) ?? null;

		// Contact capture: only when the citizen consented to be contacted about
		// candidates in their area. The form collects one contact field: an email
		// fills email, a phone number fills both sms and whatsapp.
		const isEmailContact = !!voterContact?.includes('@');
		const contactNumber =
			consentedToContact && voterContact && !isEmailContact
				? voterContact.replace(/[^\d+]/g, '') || null
				: null;
		const contactEmail = consentedToContact && isEmailContact ? voterContact!.toLowerCase() : null;
		const contactCapture = consentedToContact
			? { name: voterName, sms: contactNumber, whatsapp: contactNumber, email: contactEmail, constituency, ward }
			: { name: null, sms: null, whatsapp: null, email: null, constituency: null, ward: null };

		const pledgedLeaderIds = [
			...new Set(
				BALLOT_LEVELS.map((level) => selections[level])
					.filter((s): s is string => !!s && s.startsWith('db:'))
					.map((s) => Number(s.slice(3)))
					.filter((n) => Number.isInteger(n))
			)
		];

		for (const leaderId of pledgedLeaderIds) {
			const [candidate] = await db
				.select()
				.from(leaders)
				.innerJoin(users, eq(leaders.userId, users.id))
				.where(and(eq(leaders.id, leaderId), isNull(leaders.deletedAt)));
			if (!candidate) continue;

			const campaign = await getOrCreateMainCampaign(
				leaderId,
				candidate.users.id,
				fullName(candidate.users)
			);

			// The partial unique indexes keep one live pledge per (campaign, user/anon device);
			// a repeat submission just keeps the existing pledge.
			await db
				.insert(pledges)
				.values({
					userId: domainUser?.id ?? null,
					anonId,
					campaignId: campaign.id,
					simulationId: simulation.id,
					ip,
					userAgent,
					...contactCapture
				})
				.onConflictDoNothing();
		}

		redirect(302, `/vote/2027/${id}`);
	}
};
