// JSON-only: feeds the admin claims table's expandable row (IEBC cert, the
// claimant's own sign-off, claim history) on demand, so the list doesn't pay for
// every row's extras up front. No +page.svelte here — the profile preview lives
// at /[slug] now.
import { error, json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/dashboard';
import { getClaimExtras } from '$lib/server/claims';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	await requireAdmin(event);
	const extras = await getClaimExtras(Number(event.params.claimId));
	if (!extras) error(404, 'Claim not found');
	return json(extras);
};
