import { redirect } from '@sveltejs/kit';
import { getRouteLeaderContext, requireDashboardUser } from '$lib/server/dashboard';
import { leaderPath, fullName, getApplicationChecklist, type ApplicationChecklist } from '$lib/server/leader';
import { listAmbassadorAssignments } from '$lib/server/ambassador';
import { listUnreadNotifications } from '$lib/server/notifications';
import { getProfileAdminMeta } from '$lib/server/profiles';
import { getSwitcherProfiles } from '$lib/server/switcher';
import type { LayoutServerLoad } from './$types';

export type { ApplicationChecklist };

// Guards every /dashboard page and shares the leader context + role switcher data.
// Two leader route families hang off /dashboard: [slug]/* (a leader's own
// dashboard, slug minted at onboarding payment time) and the reserved non-leader
// segments (admin/mobilize/account/invites). The second path segment says which.
export const load: LayoutServerLoad = async (event) => {
	const segments = event.url.pathname.split('/'); // ['', 'dashboard', <family|slug>, ...]
	const family = segments[2];

	const { domainUser } = await requireDashboardUser(event);

	// No dashboard access until email is verified.
	if (!domainUser.verified.email) {
		redirect(302, `/verify/email?next=${encodeURIComponent(event.url.pathname)}`);
	}

	// citizen pages fall back to the viewer's own/first-managed context.
	const ctx = await getRouteLeaderContext(event, domainUser.id);

	const ambassadorAssignments = await listAmbassadorAssignments(domainUser.id);

	// A profile goes live at payment, no submission/review step — `application` is
	// pure form-completeness validation: it names the exact missing field per tab so
	// the UI can flag which tab (a `*` on its title) and which field (listed below
	// each tab's save button) still needs attention.
	let applicationComplete = false;
	let application: ApplicationChecklist | null = null;
	let verificationRequestedAt: Date | null = null;
	if (ctx && !ctx.verified) {
		({ application, applicationComplete, verificationRequestedAt } = await getApplicationChecklist(ctx));
	}

	// Every profile the viewer manages — the switcher lists them ALL, not just the
	// first-resolved context. Shared with /api/switcher (the lazy client-side fetch
	// used outside /dashboard) so the two never drift.
	const { myCampaigns } = await getSwitcherProfiles(domainUser.id);

	// A platform admin viewing a SPECIFIC leader's dashboard gets the header control
	// block (source/verified badges, lifecycle actions, decision forms). Gated on the
	// route FAMILY (a campaign slug or the apply flow), derived from the path rather
	// than event.params — a layout load doesn't reliably carry the deeper [id]/[slug].
	// Otherwise the citizen pages' fallback ctx (the admin's own/first-managed profile)
	// would leak the bar onto /dashboard.
	const isLeaderFamily = !['admin', 'mobilize', 'account', 'invites', undefined, ''].includes(family);
	const adminControls =
		domainUser.adminAt && ctx && isLeaderFamily
			? { ...(await getProfileAdminMeta(ctx.profileUser.id)), profileId: ctx.profileUser.id, profileName: fullName(ctx.profileUser) }
			: null;

	return {
		firstName: domainUser.firstName,
		// Unread decision notifications (verification/claim outcomes), bannered until dismissed.
		notifications: await listUnreadNotifications(domainUser.id),
		adminControls,
		myCampaigns,
		// The switcher needs this to show the RIGHT current entry when an admin is
		// viewing a profile they don't personally manage (dashboardModes.ts dedupes
		// against myCampaigns itself if the admin also happens to manage it).
		adminViewingProfileName: adminControls?.profileName ?? null,
		ambassadorFor: ambassadorAssignments.map((a) => ({ subjectId: a.subjectId, name: a.leaderName })),
		isAdmin: !!domainUser.adminAt,
		isAmbassador: ambassadorAssignments.length > 0,
		applicationComplete,
		application,
		verificationRequestedAt: verificationRequestedAt?.toISOString() ?? null,
		leaderContext: ctx
			? {
					leaderId: ctx.leader?.id ?? null,
					role: ctx.role,
					leaderName: fullName(ctx.profileUser),
					positionTitle: ctx.position?.title ?? '',
					region: ctx.position?.region ?? '',
					status: (ctx.leader?.status ?? 'aspirant'),
					verified: !!ctx.verified,
					publicPath: leaderPath(ctx.profileUser),
					// Where "Preview" points: the public URL once verified (it has a slug),
					// else the slugless /previews/[userId] route for an in-progress application.
					previewPath:
						ctx.verified && ctx.profileUser.slug ? leaderPath(ctx.profileUser) : `/previews/${ctx.profileUser.id}`,
					// A slug always exists (onboarding mints it at payment time, before
					// anyone ever reaches this dashboard).
					basePath: `/dashboard/${ctx.profileUser.slug}`
				}
			: null
	};
};
