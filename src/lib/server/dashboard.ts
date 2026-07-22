// Shared guards for /dashboard pages: every page needs the signed-in domain user,
// and most need a leader context (own profile or a managed one).
import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { getDomainUser, getLeaderContext, getLeaderContextBySlug, isPlatformAdmin, type LeaderContext } from '$lib/server/leader';
import { contacts as contactsTable, managers, type users } from '$lib/server/db/schema';

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
 * ('profile' — a distinct phantom user, see createPhantomUser). */
export type VerifyScope = 'account' | 'profile';

export function parseScope(raw: string | null): VerifyScope {
	return raw === 'profile' ? raw : 'account';
}

/** Resolves the subject a verification applies to. For 'profile' scope that's the
 * leader profile's (phantom) user — picked by the slug the originating
 * /dashboard/<slug>/* form passed along (a multi-campaign manager has several
 * profiles; guessing would target the wrong one), falling back to the
 * own/first-managed guess when no slug is given, and to the citizen when
 * there's no leader context yet. `subject === domainUser` exactly when the
 * scope is the citizen's own account — the only case where better-auth's login
 * email is synced. */
export async function resolveVerifySubject(
	event: RequestEvent,
	scope: VerifyScope,
	slug?: string | null
): Promise<DashboardUser & { subject: typeof users.$inferSelect }> {
	const base = await requireDashboardUser(event);
	if (scope === 'profile') {
		if (slug) {
			// An explicit slug must resolve with access — silently falling back to
			// the citizen would attach the verified contact to the wrong account
			// (e.g. a claim form's inputs, where the claimant has no access yet).
			const ctx = await getLeaderContextBySlug(slug, base.domainUser.id);
			if (!ctx) redirect(302, '/dashboard');
			return { ...base, subject: ctx.profileUser };
		}
		const ctx = await getLeaderContext(base.domainUser.id);
		if (ctx) return { ...base, subject: ctx.profileUser };
	}
	return { ...base, subject: base.domainUser };
}

/**
 * The leader context the current dashboard route is about — the URL, not
 * guesswork, picks which campaign is active:
 * - /dashboard/[slug]/*: the verified campaign; kicked to /dashboard when the
 *   slug doesn't resolve or the viewer lacks access.
 * - Anything else (citizen pages): the viewer's own/first-managed context, which
 *   may be null.
 */
export async function getRouteLeaderContext(
	event: RequestEvent,
	domainUserId: number
): Promise<LeaderContext | null> {
	const params = event.params as { slug?: string };
	if (params.slug) {
		const ctx = await getLeaderContextBySlug(params.slug, domainUserId);
		if (!ctx) redirect(302, '/dashboard');
		return ctx;
	}
	return getLeaderContext(domainUserId);
}

/**
 * The viewer's own OTP-verified contacts, keyed for the contact forms: typing a
 * value they already proved control of shows "✓ Verified" immediately — no
 * second OTP round-trip on any profile they create, claim, or manage.
 */
export async function ownVerifiedContacts(claimantId: number) {
	const rows = await db
		.select({ channel: contactsTable.channel, value: contactsTable.value })
		.from(contactsTable)
		.where(and(eq(contactsTable.userId, claimantId), isNotNull(contactsTable.verifiedAt), isNull(contactsTable.deletedAt)));
	const byChannel = (channel: string) => rows.filter((c) => c.channel === channel).map((c) => c.value);
	return {
		check: (channel: string, value: string) => !!value && rows.some((c) => c.channel === channel && c.value === value),
		lists: { sms: byChannel('sms'), whatsapp: byChannel('whatsapp'), email: byChannel('email') }
	};
}

/** For pages that need a leader profile; back to the citizen home if there isn't one. */
export async function requireLeader(
	event: RequestEvent
): Promise<DashboardUser & { ctx: LeaderContext }> {
	const base = await requireDashboardUser(event);
	const ctx = await getRouteLeaderContext(event, base.domainUser.id);
	if (!ctx) redirect(302, '/dashboard');
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
	// A platform admin gets full campaign-admin powers on any profile (Profiles tab).
	if (await isPlatformAdmin(domainUserId)) return true;
	// Managers attach to the person: admin if the viewer's manager row for this person
	// carries the admin role.
	const [row] = await db
		.select({ roles: managers.roles })
		.from(managers)
		.where(and(eq(managers.userId, domainUserId), eq(managers.subjectUserId, ctx.profileUser.id), isNull(managers.deletedAt)));
	return !!(row?.roles as { admin?: boolean } | undefined)?.admin;
}
