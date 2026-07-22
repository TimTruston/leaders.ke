import { redirect } from '@sveltejs/kit';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { contacts, managers, profileClaims, users } from '$lib/server/db/schema';
import { user as authUsers } from '$lib/server/db/auth.schema';
import type { ClaimEvidence } from '$lib/server/claims';
import { getRouteLeaderContext, requireDashboardUser } from '$lib/server/dashboard';
import { redirectWithFlash } from '$lib/server/flash';
import { leaderPath, fullName, getRunCampaign, resolveCurrentTerm } from '$lib/server/leader';
import { listAmbassadorAssignments } from '$lib/server/ambassador';
import { getPendingVerification, getLatestRejection } from '$lib/server/verifications';
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
// Three leader route families hang off /dashboard: apply/[id]/* (application in
// progress), claim/[slug]/* (claiming an existing profile), and [slug]/* (a
// verified campaign). The second path segment says which one this request is.
export const load: LayoutServerLoad = async (event) => {
	const segments = event.url.pathname.split('/'); // ['', 'dashboard', <family|slug>, ...]
	const family = segments[2];

	// A guest clicking "Claim this profile" lands on /dashboard/claim/<slug>/… —
	// this must run before requireDashboardUser, whose plain /login redirect would
	// otherwise win and drop both the notice and the way back to the claim form.
	if (!event.locals.user && family === 'claim') {
		const next = `${event.url.pathname}${event.url.search}`;
		redirectWithFlash(event.cookies, `/login?next=${encodeURIComponent(next)}`, 'You need to be logged in to claim a profile');
	}

	const { domainUser } = await requireDashboardUser(event);

	// No dashboard access until email is verified.
	if (!domainUser.verified.email) {
		redirect(302, `/verify/email?next=${encodeURIComponent(event.url.pathname)}`);
	}

	// Claim family: the viewer has no access to the claimed profile yet, so there
	// is no leader context — just the claimed leader's name for the header.
	let ctx: Awaited<ReturnType<typeof getRouteLeaderContext>> = null;
	let claimName: string | null = null;
	let claimSubjectUserId: number | null = null;
	let claimSubjectSlug: string | null = null;
	let claimSubjectPhotoUrl: string | null = null;
	if (family === 'claim') {
		const resolved = segments[3] ? await resolveCurrentTerm(segments[3]) : null;
		if (!resolved || (!resolved.currentTerm?.leaders.verifiedAt && !resolved.activeRun)) redirect(302, '/dashboard');
		claimName = fullName(resolved.row.users);
		claimSubjectUserId = resolved.row.users.id;
		claimSubjectSlug = resolved.row.users.slug;
		claimSubjectPhotoUrl = resolved.row.users.photoUrl;
	} else {
		// apply/[id] and [slug] resolve by their URL param (access-checked);
		// citizen pages fall back to the viewer's own/first-managed context.
		ctx = await getRouteLeaderContext(event, domainUser.id);
	}

	// Keep each application/campaign under its canonical family: approved ones
	// live at /dashboard/<slug>/*, in-progress ones at /dashboard/apply/<id>/*.
	if (ctx) {
		if (family === 'apply' && ctx.verified && ctx.profileUser.slug) {
			redirect(302, `/dashboard/${ctx.profileUser.slug}/${segments.slice(4).join('/')}${event.url.search}`);
		}
		const isCampaignFamily = !['apply', 'claim', 'admin', 'mobilize', 'account', 'invites', undefined, ''].includes(family);
		if (isCampaignFamily && !ctx.verified) {
			redirect(302, `/dashboard/apply/${ctx.profileUser.authUserId}/${segments.slice(3).join('/')}${event.url.search}`);
		}
	}

	const ambassadorAssignments = await listAmbassadorAssignments(domainUser.id);

	// Submit Application (top-right, apply mode) is gated on every one of the 4 tabs
	// being filled in — website/social links are the only optional Contacts fields.
	// `application` names the exact missing field per tab so the UI can flag which tab
	// (a `*` on its title) and which field (listed below each tab's save button) still
	// needs attention, instead of only disabling the Submit button.
	let applicationComplete = false;
	let pendingVerification = false;
	let rejection: Awaited<ReturnType<typeof getLatestRejection>> = null;
	let application: ApplicationChecklist | null = null;
	let claimSubmitted = false;
	let claimId: number | null = null;
	let claimRejection: { notes: string | null; reviewedAt: string | null } | null = null;
	if (family === 'claim' && claimSubjectUserId) {
		// The claim's checklist reads off what's been STAGED in the pending claim,
		// not the profile's real data — same shape as the apply checklist so the
		// tab `*`s and the submit widget work identically. Team is a claim
		// non-requirement (it unlocks after approval). A rejected claim stays here
		// too (not just a pending one) — resubmitting edits it in place.
		const [claimRow] = await db
			.select({ id: profileClaims.id, evidence: profileClaims.evidence, outcome: profileClaims.outcome, notes: profileClaims.notes, reviewedAt: profileClaims.reviewedAt })
			.from(profileClaims)
			.where(
				and(
					eq(profileClaims.subjectUserId, claimSubjectUserId),
					eq(profileClaims.claimedBy, domainUser.id),
					or(isNull(profileClaims.outcome), eq(profileClaims.outcome, 'rejected')),
					isNull(profileClaims.deletedAt)
				)
			)
			.orderBy(desc(profileClaims.requestedAt))
			.limit(1);
		claimId = claimRow?.id ?? null;
		if (claimRow?.outcome === 'rejected') {
			claimRejection = { notes: claimRow.notes, reviewedAt: claimRow.reviewedAt ? claimRow.reviewedAt.toISOString() : null };
		}
		const ev = (claimRow?.evidence ?? {}) as ClaimEvidence;
		application = {
			profile: toTab([[!ev.profile, 'Profile details']]),
			contacts: toTab([
				[!ev.contacts?.address, 'Office / address'],
				[!ev.contacts?.sms, 'Phone number'],
				[!ev.contacts?.email, 'Email address']
			]),
			// A claim confirms identity only — no campaign or team requirement.
			campaign: { complete: true, missing: [] },
			team: { complete: true, missing: [] },
			// A claim's own staged photo counts, but so does the real profile's existing
			// photo — the claim form preloads and shows that one until overridden, so it
			// shouldn't read as "missing" when nothing's been staged yet.
			documentation: toTab([
				[!ev.documentation?.photoUrl && !claimSubjectPhotoUrl, 'Photo']
			]),
			signoff: toTab([
				[!ev.signoff?.myRole, 'Your role'],
				[!ev.signoff?.nationalId, 'Your National ID'],
				[!ev.signoff?.idFrontUrl, 'ID front'],
				[!ev.signoff?.idBackUrl, 'ID back']
			])
		};
		applicationComplete =
			application.profile.complete &&
			application.contacts.complete &&
			application.documentation.complete &&
			application.signoff.complete;
		// Not "submitted" while a rejection is still open — the resubmit widget
		// should show again until they've re-confirmed and posted it.
		claimSubmitted = !!ev.submittedAt && claimRow?.outcome !== 'rejected';
	} else if (ctx && !ctx.verified) {
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
		pendingVerification = !!(await getPendingVerification(runCampaign?.id ?? 0));
		// Only meaningful when nothing's pending — a fresh re-submission supersedes the
		// old rejection (getLatestRejection returns null once they resubmit).
		if (!pendingVerification) rejection = await getLatestRejection(runCampaign?.id ?? 0);
	}

	// Every profile the viewer manages + every claim in flight — the switcher lists
	// them ALL, not just the first-resolved context. Shared with /api/switcher (the
	// lazy client-side fetch used outside /dashboard) so the two never drift.
	const { myCampaigns, pendingClaims } = await getSwitcherProfiles(domainUser.id);

	// A platform admin viewing a SPECIFIC leader's dashboard gets the header control
	// block (source/verified badges, lifecycle actions, decision forms). Gated on the
	// route FAMILY (a campaign slug or the apply flow), derived from the path rather
	// than event.params — a layout load doesn't reliably carry the deeper [id]/[slug].
	// Otherwise the citizen pages' fallback ctx (the admin's own/first-managed profile)
	// would leak the bar onto /dashboard.
	const isLeaderFamily = family === 'apply' || !['apply', 'claim', 'admin', 'mobilize', 'account', 'invites', undefined, ''].includes(family);
	const adminControls =
		domainUser.adminAt && ctx && isLeaderFamily
			? { ...(await getProfileAdminMeta(ctx.profileUser.id)), profileId: ctx.profileUser.id, profileName: fullName(ctx.profileUser) }
			: null;

	return {
		firstName: domainUser.firstName,
		// Unread decision notifications (verification/claim outcomes), bannered until dismissed.
		notifications: await listUnreadNotifications(domainUser.id),
		adminControls,
		claimName,
		claimSubjectSlug,
		claimId,
		claimSubmitted,
		claimRejection,
		pendingClaims,
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
		pendingVerification,
		rejection,
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
					// Verified campaigns live under their slug; in-progress applications
					// under their pre-minted UUID (the phantom's auth id).
					basePath:
						ctx.verified && ctx.profileUser.slug
							? `/dashboard/${ctx.profileUser.slug}`
							: `/dashboard/apply/${ctx.profileUser.authUserId}`
				}
			: null
	};
};
