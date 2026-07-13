import { requireDashboardUser } from '$lib/server/dashboard';
import { listFollowedLeaders, listFollowedLeadersFeed, listMyPledges } from '$lib/server/citizen';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { domainUser } = await requireDashboardUser(event);

	const [followedLeaders, feed, pledges] = await Promise.all([
		listFollowedLeaders(domainUser.id),
		listFollowedLeadersFeed(domainUser.id),
		listMyPledges(domainUser.id)
	]);

	return { followedLeaders, feed, pledges };
};
