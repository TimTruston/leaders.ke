import { redirect } from '@sveltejs/kit';
import { postLoginRedirectTarget, requireDashboardUser } from '$lib/server/dashboard';
import { listFollowedLeaders, listFollowedLeadersFeed, listMyPledges } from '$lib/server/citizen';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { domainUser } = await requireDashboardUser(event);

	// Right after a login/signup that had no explicit destination, a manager goes
	// straight to their own campaign dash instead of this citizen Overview — the
	// account switcher's own "Citizen" entry still lands here normally, since that
	// visit never carries the one-shot flag this checks. See flagPostLogin.
	const redirectTarget = await postLoginRedirectTarget(event.cookies, domainUser.id);
	if (redirectTarget) redirect(302, redirectTarget);

	const [followedLeaders, feed, pledges] = await Promise.all([
		listFollowedLeaders(domainUser.id),
		listFollowedLeadersFeed(domainUser.id),
		listMyPledges(domainUser.id)
	]);

	return { followedLeaders, feed, pledges };
};
