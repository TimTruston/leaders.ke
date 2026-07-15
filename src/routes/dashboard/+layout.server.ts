import { redirect } from '@sveltejs/kit';
import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { contacts, managers } from '$lib/server/db/schema';
import { getRouteLeaderContext, requireDashboardUser } from '$lib/server/dashboard';
import { redirectWithFlash } from '$lib/server/flash';
import { leaderPath, fullName, resolveCurrentTerm } from '$lib/server/leader';
import { listAmbassadorAssignments } from '$lib/server/ambassador';
import { getPendingVerification, getLatestRejection } from '$lib/server/verifications';
import type { LayoutServerLoad } from './$types';

// One application tab's completion state: whether it's done, and the labels of the
// fields still missing (shared with the layout nav and each tab page).
export type TabChecklist = { complete: boolean; missing: string[] };
export type ApplicationChecklist = {
	profile: TabChecklist;
	contacts: TabChecklist;
	team: TabChecklist;
	documentation: TabChecklist;
};

// Guards every /dashboard page and shares the leader context + role switcher data.
export const load: LayoutServerLoad = async (event) => {
	// A guest clicking "Claim this profile" lands on /dashboard/profile?leader=… —
	// this must run before requireDashboardUser, whose plain /login redirect would
	// otherwise win and drop both the notice and the way back to the claim form.
	if (!event.locals.user && event.url.searchParams.get('leader')) {
		const next = `${event.url.pathname}${event.url.search}`;
		redirectWithFlash(event.cookies, `/login?next=${encodeURIComponent(next)}`, 'You need to be logged in to claim a profile');
	}

	const { domainUser } = await requireDashboardUser(event);

	// No dashboard access until email is verified.
	if (!domainUser.verified.email) {
		redirect(302, `/verify/email?next=${encodeURIComponent(event.url.pathname)}`);
	}

	// Approved campaigns live at /dashboard/<slug>/* — the URL, not guesswork,
	// picks which campaign is active. Slugless paths (the apply flow, citizen
	// tabs) fall back to the viewer's own/first-managed context.
	const ctx = await getRouteLeaderContext(event, domainUser.id);
	const ambassadorAssignments = await listAmbassadorAssignments(domainUser.id);

	// Canonicalize: a verified campaign's tabs moved under its slug, so a
	// slugless campaign URL (old links, post-approval visits) redirects there.
	const routeSlug = (event.params as { slug?: string }).slug;
	if (!routeSlug && ctx?.leader.verifiedAt && ctx.profileUser.slug) {
		const section = event.url.pathname.match(
			/^\/dashboard\/(profile|contacts|team|documentation|manifesto|posts|reviews|followers|broadcasts|fundraising|pr|competitors)(\/.*)?$/
		);
		// Claim mode stays slugless — that form is about someone else's profile.
		if (section && !event.url.searchParams.get('leader')) {
			redirect(302, `/dashboard/${ctx.profileUser.slug}/${section[1]}${section[2] ?? ''}${event.url.search}`);
		}
	}

	// Claim mode (?leader=<slug>, see dashboard/profile): the apply-mode header
	// reads "Manage <name>" instead of "Create a Leader Profile".
	let claimName: string | null = null;
	const claimSlug = event.url.searchParams.get('leader');
	if (claimSlug) {
		const resolved = await resolveCurrentTerm(claimSlug);
		if (resolved?.currentTerm.leaders.verifiedAt) claimName = fullName(resolved.row.users);
	}

	// Submit Application (top-right, apply mode) is gated on every one of the 4 tabs
	// being filled in — website/social links are the only optional Contacts fields.
	// `application` names the exact missing field per tab so the UI can flag which tab
	// (a `*` on its title) and which field (listed below each tab's save button) still
	// needs attention, instead of only disabling the Submit button.
	let applicationComplete = false;
	let pendingVerification = false;
	let rejection: Awaited<ReturnType<typeof getLatestRejection>> = null;
	let application: ApplicationChecklist | null = null;
	if (ctx && !ctx.leader.verifiedAt) {
		const [contactRows, [{ n: teamSize }]] = await Promise.all([
			db
				.select({ channel: contacts.channel, value: contacts.value })
				.from(contacts)
				.where(and(eq(contacts.userId, ctx.profileUser.id), isNull(contacts.deletedAt))),
			db
				.select({ n: count() })
				.from(managers)
				.where(and(eq(managers.leaderId, ctx.leader.id), eq(managers.isActive, true)))
		]);

		// Each entry: the human label shown to the user, and whether it's still missing.
		const profileMissing = [
			[!ctx.profileUser.firstName, 'First name'],
			[!ctx.profileUser.otherNames, 'Other names'],
			[!ctx.leader.positionId, 'Position you are vying for'],
			[!ctx.profileUser.bio, 'Bio']
		];
		const contactsMissing = [
			[!ctx.profileUser.address, 'Office / address'],
			[!contactRows.some((c) => c.channel === 'sms'), 'Phone number'],
			[!contactRows.some((c) => c.channel === 'email'), 'Email address']
		];
		const teamMissing =
			teamSize < 2 ? [`${2 - teamSize} more team member${teamSize === 1 ? '' : 's'} (2 needed)`] : [];
		const docsMissing = [
			[!ctx.leader.photoUrl, 'Photo'],
			[!ctx.leader.idFrontUrl, 'ID — front'],
			[!ctx.leader.idBackUrl, 'ID — back'],
			[!ctx.leader.iebcCertificateUrl, 'IEBC Certificate of Clearance']
		];
		const toTab = (rows: (boolean | string)[][]): TabChecklist => {
			const missing = rows.filter(([isMissing]) => isMissing).map(([, label]) => label as string);
			return { complete: missing.length === 0, missing };
		};

		application = {
			profile: toTab(profileMissing),
			contacts: toTab(contactsMissing),
			team: { complete: teamMissing.length === 0, missing: teamMissing },
			documentation: toTab(docsMissing)
		};
		applicationComplete =
			application.profile.complete &&
			application.contacts.complete &&
			application.team.complete &&
			application.documentation.complete;
		pendingVerification = !!(await getPendingVerification(ctx.leader.id));
		// Only meaningful when nothing's pending — a fresh re-submission supersedes the
		// old rejection (getLatestRejection returns null once they resubmit).
		if (!pendingVerification) rejection = await getLatestRejection(ctx.leader.id);
	}

	return {
		firstName: domainUser.firstName,
		claimName,
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
					// Campaign tabs live under the slug once verified; the apply flow stays slugless.
					basePath:
						ctx.leader.verifiedAt && ctx.profileUser.slug
							? `/dashboard/${ctx.profileUser.slug}`
							: '/dashboard'
				}
			: null
	};
};
