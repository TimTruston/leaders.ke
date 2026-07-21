import { json, error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/dashboard';
import { getProfileExtras } from '$lib/server/profiles';
import type { RequestHandler } from './$types';

// On-demand extras for one Profiles-tab row when it expands: the profile's claim
// history (past claimants + verdicts) and verification/application history.
export const GET: RequestHandler = async (event) => {
	await requireAdmin(event);
	const id = Number(event.params.profileId);
	if (!id) error(400, 'Invalid profile id');
	return json(await getProfileExtras(id));
};
