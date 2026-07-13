// Shared guards for /dashboard pages: every page needs the signed-in domain user,
// and most need a leader context (own profile or a managed one).
import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { getDomainUser, getLeaderContext, type LeaderContext } from '$lib/server/leader';
import { managers, type users } from '$lib/server/db/schema';

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

/** For /dashboard/admin/* pages. adminAt is set manually (psql) for now — no self-serve path. */
export async function requireAdmin(event: RequestEvent): Promise<DashboardUser> {
	const base = await requireDashboardUser(event);
	if (!base.domainUser.adminAt) redirect(302, '/dashboard');
	return base;
}

/** onboarding.md: "leader is also a manager with admin role" — the campaign owner
 * is always admin; an invited manager only is if their managers.roles has admin:
 * true. Admin-only actions: inviting/removing managers, fundraising, deleting the
 * campaign. (Managing ambassadors, posts, etc. is open to every manager.) */
export async function isCampaignAdmin(domainUserId: number, ctx: LeaderContext): Promise<boolean> {
	if (ctx.role === 'leader') return true;
	const [row] = await db
		.select({ roles: managers.roles })
		.from(managers)
		.where(and(eq(managers.userId, domainUserId), eq(managers.leaderId, ctx.leader.id), isNull(managers.deletedAt)));
	return !!(row?.roles as { admin?: boolean } | undefined)?.admin;
}
