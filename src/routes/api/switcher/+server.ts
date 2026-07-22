import { json, error } from '@sveltejs/kit';
import { getDomainUser } from '$lib/server/leader';
import { getSwitcherProfiles } from '$lib/server/switcher';
import type { RequestHandler } from './$types';

// Lazy-loaded by the Header's account switcher on any page OUTSIDE /dashboard,
// where the dashboard layout's own (already-computed) myCampaigns isn't available —
// running this query on every public page's SSR load would tax every page view
// for every signed-in visitor instead of just an actual switcher open.
// A plain 401 (not requireDashboardUser's redirect) since this is a fetch() target,
// not a navigable page — the Header only calls it once a user is already known.
export const GET: RequestHandler = async (event) => {
	if (!event.locals.user) error(401, 'Not signed in.');
	const domainUser = await getDomainUser(event.locals.user.id);
	if (!domainUser) error(401, 'Not signed in.');
	const { myCampaigns } = await getSwitcherProfiles(domainUser.id);
	return json({ myCampaigns, isAdmin: !!domainUser.adminAt });
};
