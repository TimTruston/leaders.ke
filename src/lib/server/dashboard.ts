// Shared guards for /dashboard pages: every page needs the signed-in domain user,
// and most need a leader context (own profile or a managed one).
import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { getDomainUser, getLeaderContext, type LeaderContext } from '$lib/server/leader';
import type { users } from '$lib/server/db/schema';

export type DashboardUser = {
	authUser: NonNullable<RequestEvent['locals']['user']>;
	domainUser: typeof users.$inferSelect;
};

/** Redirects to /login when signed out; the domain profile always exists (created by the signup hook). */
export async function requireDashboardUser(event: RequestEvent): Promise<DashboardUser> {
	const authUser = event.locals.user;
	if (!authUser) redirect(302, '/login');
	const domainUser = await getDomainUser(authUser.id);
	if (!domainUser) redirect(302, '/login');
	return { authUser, domainUser };
}

/** For pages that need a leader profile; sends new accounts to the profile step first. */
export async function requireLeader(
	event: RequestEvent
): Promise<DashboardUser & { ctx: LeaderContext }> {
	const base = await requireDashboardUser(event);
	const ctx = await getLeaderContext(base.domainUser.id);
	if (!ctx) redirect(302, '/dashboard/profile');
	return { ...base, ctx };
}
