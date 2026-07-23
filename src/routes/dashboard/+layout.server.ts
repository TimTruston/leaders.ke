import { redirect } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { contacts, managers, users } from '$lib/server/db/schema';
import { user as authUsers } from '$lib/server/db/auth.schema';
import { getRouteLeaderContext, requireDashboardUser } from '$lib/server/dashboard';
import { leaderPath, fullName, getRunCampaign, resolveCurrentTerm } from '$lib/server/leader';
import { listAmbassadorAssignments } from '$lib/server/ambassador';
import { getPlatformSettings } from '$lib/server/settings';
import { signoffComplete, type ManagerRoles } from '$lib/utils/campaignRoles';
import { listUnreadNotifications } from '$lib/server/notifications';
import { getProfileAdminMeta } from '$lib/server/profiles';
import { getSwitcherProfiles } from '$lib/server/switcher';
import type { LayoutServerLoad } from './$types';

// One application tab's completion state: whether it's done, and the labels of the
// fields still missing (shared with the layout nav and each tab page).
export type TabChecklist = { complete: boolean; missing: string[] };
export type ApplicationChecklist = {
	profile: TabChecklist;
	contacts: TabChecklist;
	campaign: TabChecklist;
	team: TabChecklist;
	documentation: TabChecklist;
	/** The applicant's attestation: role, national ID, and their ID images. */
	signoff: TabChecklist;
};

// Each entry: whether the field is still missing, and the human label shown for it.
const toTab = (rows: (boolean | string)[][]): TabChecklist => {
	const missing = rows.filter(([isMissing]) => isMissing).map(([, label]) => label as string);
	return { complete: missing.length === 0, missing };
};

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
	if (ctx && !ctx.verified) {
		const settings = await getPlatformSettings();
		const requiredManagers = settings.requiredTeamManagers;
		const requiredSignoffs = settings.requiredSignoffs;

		const [contactRows, managerRows] = await Promise.all([
			db
				.select({ channel: contacts.channel, value: contacts.value })
				.from(contacts)
				.where(and(eq(contacts.userId, ctx.profileUser.id), isNull(contacts.deletedAt))),
			// Active team, each with their own sign-off roles and whether their account
			// email is verified — the two verification gates count across the whole team.
			db
				.select({ userId: managers.userId, roles: managers.roles, emailVerified: authUsers.emailVerified, idFrontUrl: users.idFrontUrl, idBackUrl: users.idBackUrl })
				.from(managers)
				.innerJoin(users, eq(managers.userId, users.id))
				.innerJoin(authUsers, eq(users.authUserId, authUsers.id))
				.where(and(eq(managers.subjectUserId, ctx.profileUser.id), eq(managers.isActive, true), isNull(managers.deletedAt)))
		]);

		const verifiedManagers = managerRows.filter((m) => m.emailVerified).length;
		const completedSignoffs = managerRows.filter((m) => signoffComplete(m.roles as ManagerRoles, m)).length;

		// Verification targets the RUN (campaign): the IEBC cert and the request live on it.
		const runCampaign = await getRunCampaign(ctx.profileUser.id);

		// Each entry: the human label shown to the user, and whether it's still missing.
		const profileMissing = [
			[!ctx.profileUser.firstName, 'First name'],
			[!ctx.profileUser.otherNames, 'Other names'],
			[!ctx.profileUser.bio, 'Bio']
		];
		// The Campaign tab holds the run: seat, title, platform, IEBC certificate.
		const campaignMissing = [
			[!runCampaign?.positionId, 'Seat contested'],
			[!runCampaign?.title, 'Campaign title'],
			[!runCampaign?.description, 'Campaign platform'],
			[!runCampaign?.iebcCertificateUrl, 'IEBC Certificate of Clearance']
		];
		const contactsMissing = [
			[!ctx.profileUser.address, 'Office / address'],
			[!contactRows.some((c) => c.channel === 'sms'), 'Phone number'],
			[!contactRows.some((c) => c.channel === 'email'), 'Email address']
		];
		// Team gate: enough email-verified managers (admin-set count).
		const managersShort = requiredManagers - verifiedManagers;
		const teamMissing =
			managersShort > 0
				? [`${managersShort} more verified team member${managersShort === 1 ? '' : 's'} (${requiredManagers} needed)`]
				: [];
		const docsMissing = [
			[!ctx.profileUser.photoUrl, 'Photo']
		];
		// Sign-off gate: enough managers who've each completed their own sign-off
		// (role + national ID + ID images). Each manager attests on the Team tab
		// under their own entry; the per-field prompts live there.
		const signoffsShort = requiredSignoffs - completedSignoffs;
		const signoffMissing =
			signoffsShort > 0
				? [`${signoffsShort} more completed sign-off${signoffsShort === 1 ? '' : 's'} (${requiredSignoffs} needed)`]
				: [];
		application = {
			profile: toTab(profileMissing),
			contacts: toTab(contactsMissing),
			campaign: toTab(campaignMissing),
			team: { complete: teamMissing.length === 0, missing: teamMissing },
			documentation: toTab(docsMissing),
			signoff: { complete: signoffMissing.length === 0, missing: signoffMissing }
		};
		applicationComplete =
			application.profile.complete &&
			application.contacts.complete &&
			application.campaign.complete &&
			application.team.complete &&
			application.documentation.complete &&
			application.signoff.complete;
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
