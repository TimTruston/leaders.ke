import { requireAdmin } from '$lib/server/dashboard';
import { getRevenueSummary, listSubscriptions } from '$lib/server/revenue';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	await requireAdmin(event);
	const [subscriptions, revenue] = await Promise.all([listSubscriptions(), getRevenueSummary()]);
	return { subscriptions, revenue };
};
