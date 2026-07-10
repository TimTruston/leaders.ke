import { requireDashboardUser } from '$lib/server/dashboard';
import { getLeaderContext, leaderPath, fullName } from '$lib/server/leader';
import type { LayoutServerLoad } from './$types';

// Guards every /dashboard page and shares the leader context with the section nav.
export const load: LayoutServerLoad = async (event) => {
	const { authUser, domainUser } = await requireDashboardUser(event);
	const ctx = await getLeaderContext(domainUser.id);

	return {
		firstName: domainUser.firstName,
		email: authUser.email,
		emailVerified: authUser.emailVerified,
		leaderContext: ctx
			? {
					leaderId: ctx.leader.id,
					role: ctx.role,
					leaderName: fullName(ctx.profileUser),
					positionTitle: ctx.position.title,
					region: ctx.position.region,
					status: ctx.leader.status,
					verified: !!ctx.leader.verifiedAt,
					publicPath: leaderPath(ctx.profileUser)
				}
			: null
	};
};
