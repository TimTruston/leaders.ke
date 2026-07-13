import { requireDashboardUser } from '$lib/server/dashboard';
import { getLeaderContext, leaderPath, fullName } from '$lib/server/leader';
import { listAmbassadorAssignments } from '$lib/server/ambassador';
import type { LayoutServerLoad } from './$types';

// Guards every /dashboard page and shares the leader context + role switcher data.
export const load: LayoutServerLoad = async (event) => {
	const { authUser, domainUser } = await requireDashboardUser(event);
	const ctx = await getLeaderContext(domainUser.id);
	const ambassadorAssignments = await listAmbassadorAssignments(domainUser.id);

	return {
		firstName: domainUser.firstName,
		email: authUser.email,
		emailVerified: authUser.emailVerified,
		verificationEmailSentAt: domainUser.verificationEmailSentAt?.toISOString() ?? null,
		isAdmin: !!domainUser.adminAt,
		isAmbassador: ambassadorAssignments.length > 0,
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
