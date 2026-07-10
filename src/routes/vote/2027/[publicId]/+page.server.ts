import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { ballotSimulations } from '$lib/server/db/schema';
import { findCountyBySlug, findConstituencyBySlug, findWardBySlug } from '$lib/data/geo';
import { BALLOT_LEVELS, resolveCandidateById, type BallotLevel } from '$lib/server/ballot';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const [row] = await db
		.select()
		.from(ballotSimulations)
		.where(eq(ballotSimulations.publicId, params.publicId));

	if (!row) error(404, 'Ballot not found');

	const selections = row.selections as Record<BallotLevel, string | null>;

	// Re-resolve live candidate data per level — never freeze it, so verification/profile
	// updates surface automatically on old shared links.
	const results = await Promise.all(
		BALLOT_LEVELS.map(async (level) => ({
			level,
			candidate: await resolveCandidateById(selections[level] ?? null)
		}))
	);

	return {
		publicId: row.publicId,
		countyName: findCountyBySlug(row.county)?.name ?? row.county,
		constituencyName: findConstituencyBySlug(row.constituency)?.name ?? row.constituency,
		wardName: findWardBySlug(row.ward)?.name ?? row.ward,
		results
	};
};
