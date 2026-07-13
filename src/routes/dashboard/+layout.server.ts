import { redirect } from '@sveltejs/kit';
import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { contacts, managers } from '$lib/server/db/schema';
import { requireDashboardUser } from '$lib/server/dashboard';
import { getLeaderContext, leaderPath, fullName } from '$lib/server/leader';
import { listAmbassadorAssignments } from '$lib/server/ambassador';
import { getPendingVerification } from '$lib/server/verifications';
import type { LayoutServerLoad } from './$types';

// Guards every /dashboard page and shares the leader context + role switcher data.
export const load: LayoutServerLoad = async (event) => {
	const { domainUser } = await requireDashboardUser(event);

	// No dashboard access until both email and phone are verified.
	if (!domainUser.verified.email || !domainUser.verified.sms) {
		redirect(302, `/verify?next=${encodeURIComponent(event.url.pathname)}`);
	}

	const ctx = await getLeaderContext(domainUser.id);
	const ambassadorAssignments = await listAmbassadorAssignments(domainUser.id);

	// Submit Application (top-right, apply mode) is gated on every one of the 4 tabs
	// being filled in — website/social links are the only optional Contacts fields.
	let applicationComplete = false;
	let pendingVerification = false;
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

		const hasProfile = !!(ctx.profileUser.firstName && ctx.profileUser.otherNames && ctx.profileUser.bio && ctx.leader.positionId);
		const hasContacts = !!(
			ctx.profileUser.address &&
			contactRows.some((c) => c.channel === 'sms') &&
			contactRows.some((c) => c.channel === 'email')
		);
		const hasTeam = teamSize >= 2;
		const hasDocs = !!(
			ctx.leader.photoUrl &&
			ctx.leader.idFrontUrl &&
			ctx.leader.idBackUrl &&
			ctx.leader.iebcCertificateUrl
		);
		applicationComplete = hasProfile && hasContacts && hasTeam && hasDocs;
		pendingVerification = !!(await getPendingVerification(ctx.leader.id));
	}

	return {
		firstName: domainUser.firstName,
		isAdmin: !!domainUser.adminAt,
		isAmbassador: ambassadorAssignments.length > 0,
		applicationComplete,
		pendingVerification,
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
