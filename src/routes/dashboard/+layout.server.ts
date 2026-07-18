import { redirect } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { contacts, leaders, managers, profileClaims, users } from '$lib/server/db/schema';
import { user as authUsers } from '$lib/server/db/auth.schema';
import type { ClaimEvidence } from '$lib/server/claims';
import { getRouteLeaderContext, requireDashboardUser } from '$lib/server/dashboard';
import { redirectWithFlash } from '$lib/server/flash';
import { leaderPath, fullName, resolveCurrentTerm } from '$lib/server/leader';
import { listAmbassadorAssignments } from '$lib/server/ambassador';
import { getPendingVerification, getLatestRejection } from '$lib/server/verifications';
import { getPlatformSettings } from '$lib/server/settings';
import { signoffComplete, type ManagerRoles } from '$lib/utils/campaignRoles';
import { listUnreadNotifications } from '$lib/server/notifications';
import type { LayoutServerLoad } from './$types';

// One application tab's completion state: whether it's done, and the labels of the
// fields still missing (shared with the layout nav and each tab page).
export type TabChecklist = { complete: boolean; missing: string[] };
export type ApplicationChecklist = {
	profile: TabChecklist;
	contacts: TabChecklist;
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
	let claimLeaderId: number | null = null;
	if (family === 'claim') {
		const resolved = segments[3] ? await resolveCurrentTerm(segments[3]) : null;
		if (!resolved || !resolved.currentTerm.leaders.verifiedAt) redirect(302, '/dashboard');
		claimName = fullName(resolved.row.users);
		claimLeaderId = resolved.currentTerm.leaders.id;
	} else {
		// apply/[id] and [slug] resolve by their URL param (access-checked);
		// citizen pages fall back to the viewer's own/first-managed context.
		ctx = await getRouteLeaderContext(event, domainUser.id);
	}

	// Keep each application/campaign under its canonical family: approved ones
	// live at /dashboard/<slug>/*, in-progress ones at /dashboard/apply/<id>/*.
	if (ctx) {
		if (family === 'apply' && ctx.leader.verifiedAt && ctx.profileUser.slug) {
			redirect(302, `/dashboard/${ctx.profileUser.slug}/${segments.slice(4).join('/')}${event.url.search}`);
		}
		const isCampaignFamily = !['apply', 'claim', 'admin', 'mobilize', 'account', 'invites', undefined, ''].includes(family);
		if (isCampaignFamily && !ctx.leader.verifiedAt) {
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
	if (family === 'claim' && claimLeaderId) {
		// The claim's checklist reads off what's been STAGED in the pending claim,
		// not the profile's real data — same shape as the apply checklist so the
		// tab `*`s and the submit widget work identically. Team is a claim
		// non-requirement (it unlocks after approval).
		const [claimRow] = await db
			.select({ evidence: profileClaims.evidence })
			.from(profileClaims)
			.where(and(eq(profileClaims.leaderId, claimLeaderId), eq(profileClaims.claimedBy, domainUser.id), isNull(profileClaims.outcome)));
		const ev = (claimRow?.evidence ?? {}) as ClaimEvidence;
		application = {
			profile: toTab([[!ev.profile, 'Profile details']]),
			contacts: toTab([
				[!ev.contacts?.address, 'Office / address'],
				[!ev.contacts?.sms, 'Phone number'],
				[!ev.contacts?.email, 'Email address']
			]),
			// Team management belongs to the profile's admins; a claim has no team requirement.
			team: { complete: true, missing: [] },
			documentation: toTab([
				[!ev.documentation?.photoUrl, 'Photo'],
				[!ev.documentation?.iebcCertificateUrl, 'IEBC Certificate of Clearance']
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
		claimSubmitted = !!ev.submittedAt;
	} else if (ctx && !ctx.leader.verifiedAt) {
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
				.select({ userId: managers.userId, roles: managers.roles, emailVerified: authUsers.emailVerified })
				.from(managers)
				.innerJoin(users, eq(managers.userId, users.id))
				.innerJoin(authUsers, eq(users.authUserId, authUsers.id))
				.where(and(eq(managers.leaderId, ctx.leader.id), eq(managers.isActive, true), isNull(managers.deletedAt)))
		]);

		const verifiedManagers = managerRows.filter((m) => m.emailVerified).length;
		const completedSignoffs = managerRows.filter((m) => signoffComplete(m.roles as ManagerRoles)).length;

		// Each entry: the human label shown to the user, and whether it's still missing.
		const profileMissing = [
			[!ctx.profileUser.firstName, 'First name'],
			[!ctx.profileUser.otherNames, 'Other names'],
			[!ctx.leader.positionId, 'Elective position'],
			[!ctx.profileUser.bio, 'Bio']
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
			[!ctx.leader.photoUrl, 'Photo'],
			[!ctx.leader.iebcCertificateUrl, 'IEBC Certificate of Clearance']
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
			team: { complete: teamMissing.length === 0, missing: teamMissing },
			documentation: toTab(docsMissing),
			signoff: { complete: signoffMissing.length === 0, missing: signoffMissing }
		};
		applicationComplete =
			application.profile.complete &&
			application.contacts.complete &&
			application.team.complete &&
			application.documentation.complete &&
			application.signoff.complete;
		pendingVerification = !!(await getPendingVerification(ctx.leader.id));
		// Only meaningful when nothing's pending — a fresh re-submission supersedes the
		// old rejection (getLatestRejection returns null once they resubmit).
		if (!pendingVerification) rejection = await getLatestRejection(ctx.leader.id);
	}

	// Every campaign the viewer leads or actively manages — the switcher lists
	// them ALL (verified ones under their slug, in-progress applications under
	// their apply UUID), not just the first-resolved context.
	const managedRows = await db
		.select({
			leaderId: leaders.id,
			firstName: users.firstName,
			otherNames: users.otherNames,
			slug: users.slug,
			authUserId: users.authUserId,
			verifiedAt: leaders.verifiedAt,
			startAt: leaders.startAt
		})
		.from(managers)
		.innerJoin(leaders, eq(managers.leaderId, leaders.id))
		.innerJoin(users, eq(leaders.userId, users.id))
		.where(and(eq(managers.userId, domainUser.id), eq(managers.isActive, true), isNull(managers.deletedAt), isNull(leaders.deletedAt)));
	// Managers attach to the PERSON, not a term: one switcher entry per managed person,
	// collapsing their terms to the active one (latest start) for the link + verified badge.
	const byPerson = new Map<string, (typeof managedRows)[number]>();
	for (const r of managedRows) {
		const prev = byPerson.get(r.authUserId);
		if (!prev || r.startAt.getTime() > prev.startAt.getTime()) byPerson.set(r.authUserId, r);
	}
	const myCampaigns = [...byPerson.values()].map((r) => ({
		leaderId: r.leaderId,
		name: fullName(r),
		verified: !!r.verifiedAt,
		basePath: r.verifiedAt && r.slug ? `/dashboard/${r.slug}` : `/dashboard/apply/${r.authUserId}`
	}));

	// Every claim the viewer has in flight — the switcher lists them so a claim
	// stays reachable after navigating away.
	const pendingClaimRows = await db
		.select({ slug: users.slug, firstName: users.firstName, otherNames: users.otherNames })
		.from(profileClaims)
		.innerJoin(leaders, eq(profileClaims.leaderId, leaders.id))
		.innerJoin(users, eq(leaders.userId, users.id))
		.where(and(eq(profileClaims.claimedBy, domainUser.id), isNull(profileClaims.outcome)));
	const pendingClaims = pendingClaimRows
		.filter((r) => r.slug)
		.map((r) => ({ slug: r.slug as string, name: fullName(r) }));

	return {
		firstName: domainUser.firstName,
		// Unread decision notifications (verification/claim outcomes), bannered until dismissed.
		notifications: await listUnreadNotifications(domainUser.id),
		claimName,
		claimSubmitted,
		pendingClaims,
		myCampaigns,
		ambassadorFor: ambassadorAssignments.map((a) => ({ leaderId: a.leaderId, name: a.leaderName })),
		isAdmin: !!domainUser.adminAt,
		isAmbassador: ambassadorAssignments.length > 0,
		applicationComplete,
		application,
		pendingVerification,
		rejection,
		leaderContext: ctx
			? {
					leaderId: ctx.leader.id,
					role: ctx.role,
					leaderName: fullName(ctx.profileUser),
					positionTitle: ctx.position.title,
					region: ctx.position.region,
					status: ctx.leader.status,
					verified: !!ctx.leader.verifiedAt,
					publicPath: leaderPath(ctx.profileUser),
					// Verified campaigns live under their slug; in-progress applications
					// under their pre-minted UUID (the phantom's auth id).
					basePath:
						ctx.leader.verifiedAt && ctx.profileUser.slug
							? `/dashboard/${ctx.profileUser.slug}`
							: `/dashboard/apply/${ctx.profileUser.authUserId}`
				}
			: null
	};
};
