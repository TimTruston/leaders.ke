import { fail } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { ambassadors, invites, managers, users } from '$lib/server/db/schema';
import { user as authUsers } from '$lib/server/db/auth.schema';
import { getRouteLeaderContext, isCampaignAdmin, requireDashboardUser, requireLeader } from '$lib/server/dashboard';
import { createInvite, listOpenInvites, revokeInvite, tryDirectGrant } from '$lib/server/invites';
import { fullName } from '$lib/server/leader';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { domainUser } = await requireDashboardUser(event);
	const ctx = await getRouteLeaderContext(event, domainUser.id);
	// Reachable before a profile is saved (applying), just with nothing to show yet —
	// unlike the rest of this page's actions, which still require ctx (requireLeader).
	if (!ctx) return { noProfile: true as const };

	const [managerRows, ambassadorRows, openInvites, isAdmin] = await Promise.all([
		db
			.select()
			.from(managers)
			.innerJoin(users, eq(managers.userId, users.id))
			.innerJoin(authUsers, eq(users.authUserId, authUsers.id))
			.where(and(eq(managers.leaderId, ctx.leader.id), isNull(managers.deletedAt))),
		db
			.select()
			.from(ambassadors)
			.innerJoin(users, eq(ambassadors.userId, users.id))
			.innerJoin(authUsers, eq(users.authUserId, authUsers.id))
			.where(and(eq(ambassadors.leaderId, ctx.leader.id), isNull(ambassadors.deletedAt))),
		listOpenInvites(ctx.leader.id),
		isCampaignAdmin(domainUser.id, ctx)
	]);

	return {
		noProfile: false as const,
		id: domainUser.id,
		isAdmin,
		managers: managerRows.map((r) => ({
			id: r.managers.id,
			userId: r.managers.userId,
			name: fullName(r.users),
			email: r.user.email,
			active: r.managers.isActive,
			admin: !!(r.managers.roles as { admin?: boolean } | null)?.admin
		})),
		ambassadors: ambassadorRows.map((r) => ({
			id: r.ambassadors.id,
			name: fullName(r.users),
			email: r.user.email,
			active: r.ambassadors.isActive
		})),
		invites: openInvites.filter((i) => i.role === 'manager'),
		ambassadorInvites: openInvites.filter((i) => i.role === 'ambassador')
	};
};

export const actions: Actions = {
	inviteManager: async (event) => {
		const { domainUser, ctx } = await requireLeader(event);
		if (!(await isCampaignAdmin(domainUser.id, ctx))) {
			return fail(403, { error: 'Only an admin manager can invite other managers.' });
		}
		const form = await event.request.formData();
		const email = String(form.get('email') ?? '').trim();
		if (!email) return fail(400, { error: 'Enter an email address to invite.' });

		const granted = await tryDirectGrant(ctx.leader.id, 'manager', email);
		if (granted) return { granted: { email, role: 'Manager' } };

		try {
			await createInvite(ctx.leader.id, 'manager', domainUser.id, email, event.url.origin);
		} catch (error) {
			return fail(400, { error: error instanceof Error ? error.message : 'Could not send invite.' });
		}
		return { invited: { email } };
	},

	inviteAmbassador: async (event) => {
		const { domainUser, ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const email = String(form.get('email') ?? '').trim();
		if (!email) return fail(400, { error: 'Enter an email address to invite.' });

		const granted = await tryDirectGrant(ctx.leader.id, 'ambassador', email);
		if (granted) return { granted: { email, role: 'Ambassador' } };

		try {
			await createInvite(ctx.leader.id, 'ambassador', domainUser.id, email, event.url.origin);
		} catch (error) {
			return fail(400, { error: error instanceof Error ? error.message : 'Could not send invite.' });
		}
		return { invited: { email } };
	},

	revokeInvite: async (event) => {
		const { domainUser, ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const inviteId = Number(form.get('inviteId') ?? 0);

		// Check the invite's actual role from the DB, not the form's hidden field —
		// a non-admin manager could otherwise submit role=ambassador against a
		// manager invite's id to dodge the admin gate below.
		const [invite] = await db
			.select({ role: invites.role })
			.from(invites)
			.where(and(eq(invites.id, inviteId), eq(invites.leaderId, ctx.leader.id)));
		if (!invite) return fail(404, { error: 'Invite not found.' });

		if (invite.role === 'manager' && !(await isCampaignAdmin(domainUser.id, ctx))) {
			return fail(403, { error: 'Only an admin manager can revoke manager invites.' });
		}
		await revokeInvite(ctx.leader.id, inviteId);
		return { revoked: true };
	},

	removeManager: async (event) => {
		const { domainUser, ctx } = await requireLeader(event);
		if (!(await isCampaignAdmin(domainUser.id, ctx))) {
			return fail(403, { error: 'Only an admin manager can remove other managers.' });
		}
		const form = await event.request.formData();
		const memberId = Number(form.get('memberId') ?? 0);

		const [member] = await db
			.select({ email: authUsers.email, roles: managers.roles })
			.from(managers)
			.innerJoin(users, eq(managers.userId, users.id))
			.innerJoin(authUsers, eq(users.authUserId, authUsers.id))
			.where(and(eq(managers.id, memberId), eq(managers.leaderId, ctx.leader.id)));
		if (!member) return fail(404, { error: 'Manager not found.' });

		// Only admins reduce the admin count — removing a plain manager never needs this check.
		const targetIsAdmin = !!(member.roles as { admin?: boolean } | null)?.admin;
		if (targetIsAdmin) {
			// roles is jsonb (no direct SQL predicate on it here) — filter in JS.
			const activeRows = await db
				.select({ roles: managers.roles })
				.from(managers)
				.where(and(eq(managers.leaderId, ctx.leader.id), eq(managers.isActive, true), isNull(managers.deletedAt)));
			const activeAdminCount = activeRows.filter((r) => (r.roles as { admin?: boolean } | null)?.admin).length;
			if (activeAdminCount < 2) {
				return fail(403, { error: 'Add another admin manager before removing yourself.' });
			}
		}

		// Blueprint rule: removing a manager leaves their ambassadors attached to the campaign.
		await db
			.update(managers)
			.set({ isActive: false, deletedAt: new Date() })
			.where(and(eq(managers.id, memberId), eq(managers.leaderId, ctx.leader.id)));
		return { removed: { email: member.email } };
	},

	removeAmbassador: async (event) => {
		const { ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const memberId = Number(form.get('memberId') ?? 0);

		const [member] = await db
			.select({ email: authUsers.email })
			.from(ambassadors)
			.innerJoin(users, eq(ambassadors.userId, users.id))
			.innerJoin(authUsers, eq(users.authUserId, authUsers.id))
			.where(and(eq(ambassadors.id, memberId), eq(ambassadors.leaderId, ctx.leader.id)));

		// Blueprint rule: removing an ambassador leaves their subscribers attached to the campaign.
		await db
			.update(ambassadors)
			.set({ isActive: false, deletedAt: new Date() })
			.where(and(eq(ambassadors.id, memberId), eq(ambassadors.leaderId, ctx.leader.id)));
		return { removed: { email: member?.email ?? '' } };
	}
};
