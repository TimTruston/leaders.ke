import { requireDashboardUser } from '$lib/server/dashboard';
import { listMyPledges } from '$lib/server/citizen';
import type { PageServerLoad } from './$types';

// The citizen mode's "My Vote" tab — the other half of what used to be one
// combined Overview page (see /dashboard for "Local News", which stayed at the
// root path along with the post-login redirect check).
export const load: PageServerLoad = async (event) => {
	const { domainUser } = await requireDashboardUser(event);
	return { pledges: await listMyPledges(domainUser.id) };
};
