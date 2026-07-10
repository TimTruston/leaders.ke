import { fail, redirect } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { db } from '$lib/server/db';
import { ballotSimulations } from '$lib/server/db/schema';
import { counties, findCountyBySlug, findConstituencyBySlug, findWardBySlug } from '$lib/data/geo';
import { BALLOT_LEVELS, resolveCandidates, type BallotLevel } from '$lib/server/ballot';
import type { Actions, PageServerLoad } from './$types';

function publicId(): string {
	return randomBytes(6).toString('hex'); // 12 hex chars, matches ballotSimulations.publicId(12)
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
		await db.insert(ballotSimulations).values({
			publicId: id,
			county,
			constituency,
			ward,
			pollingStation,
			selections,
			voterName,
			voterContact,
			consentedToContact
		});

		redirect(302, `/vote/2027/${id}`);
	}
};
