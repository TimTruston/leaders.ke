import { json } from '@sveltejs/kit';
import { requireDashboardUser } from '$lib/server/dashboard';
import { findMatchingProfiles } from '$lib/server/onboard';
import type { RequestHandler } from './$types';

// Live Profile Matcher: the onboard form fetches this as the citizen fills in the
// name, so the "Matching Profiles" panel updates without a full submit.
export const GET: RequestHandler = async (event) => {
	await requireDashboardUser(event);
	const first = event.url.searchParams.get('first') ?? '';
	const other = event.url.searchParams.get('other') ?? '';
	return json({ matches: await findMatchingProfiles(first, other) });
};
