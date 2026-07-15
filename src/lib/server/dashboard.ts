// Shared guards for /dashboard pages: every page needs the signed-in domain user,
// and most need a leader context (own profile or a managed one).
import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { getDomainUser, getLeaderContext, getLeaderContextBySlug, type LeaderContext } from '$lib/server/leader';
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

/** Whose contacts a /verify/* flow writes to: the signed-in citizen's own login
 * identity ('account', e.g. /dashboard/account), or the leader profile they edit
 * on /dashboard/contacts ('profile' — a distinct phantom user, see createPhantomUser). */
export type VerifyScope = 'account' | 'profile';

export function parseScope(raw: string | null): VerifyScope {
	return raw === 'profile' ? 'profile' : 'account';
}

/** Resolves the subject a verification applies to. For 'profile' scope that's the
 * leader profile's (phantom) user; it falls back to the citizen when there's no
 * leader context yet. `subject === domainUser` exactly when the scope is the
 * citizen's own account — the only case where better-auth's login email is synced. */
export async function resolveVerifySubject(
	event: RequestEvent,
	scope: VerifyScope
): Promise<DashboardUser & { subject: typeof users.$inferSelect }> {
	const base = await requireDashboardUser(event);
	if (scope === 'profile') {
		const ctx = await getLeaderContext(base.domainUser.id);
		if (ctx) return { ...base, subject: ctx.profileUser };
	}
	return { ...base, subject: base.domainUser };
}

/**
 * The leader context a /dashboard/[[slug]]/* route is about. An explicit slug
 * (approved campaigns live at /dashboard/<slug>/*) picks that exact campaign —
 * kicked back to /dashboard when it doesn't resolve or the viewer lacks access.
 * Slugless URLs (the apply flow) fall back to the viewer's own/first-managed
 * context, which may be null (nothing created yet).
 */
export async function getRouteLeaderContext(
	event: RequestEvent,
	domainUserId: number
): Promise<LeaderContext | null> {
	const slug = (event.params as { slug?: string }).slug;
	if (slug) {
		const ctx = await getLeaderContextBySlug(slug, domainUserId);
		if (!ctx) redirect(302, '/dashboard');
		return ctx;
	}
	return getLeaderContext(domainUserId);
}

/** For pages that need a leader profile; sends new accounts to the profile step first. */
export async function requireLeader(
	event: RequestEvent
): Promise<DashboardUser & { ctx: LeaderContext }> {
	const base = await requireDashboardUser(event);
	const ctx = await getRouteLeaderContext(event, base.domainUser.id);
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
