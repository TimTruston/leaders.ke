// JSON-only: feeds the admin verifications table's expandable row (IEBC cert,
// team sign-offs, request history) on demand, so the list doesn't pay for every
// row's extras up front. No +page.svelte here — the profile/campaign previews
// live at /[slug] and /[slug]/[year] now.
import { error, json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/dashboard';
import { getVerificationExtras } from '$lib/server/verifications';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	await requireAdmin(event);
	const extras = await getVerificationExtras(Number(event.params.verificationId));
	if (!extras) error(404, 'Verification not found');
	return json(extras);
};
