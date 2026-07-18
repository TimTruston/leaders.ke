import { fail } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { ambassadors, invites, managers, users } from '$lib/server/db/schema';
import { user as authUsers } from '$lib/server/db/auth.schema';
import { getRouteLeaderContext, isCampaignAdmin, requireDashboardUser, requireLeader } from '$lib/server/dashboard';
import { createInvite, listOpenInvites, revokeInvite, tryDirectGrant } from '$lib/server/invites';
import { fullName } from '$lib/server/leader';
import { isCampaignRole, type ManagerRoles } from '$lib/utils/campaignRoles';
import { saveLeaderDocument, type UploadKind } from '$lib/server/storage';
import type { Actions, PageServerLoad } from './$types';

// Each manager's own ID images live on their OWN users row (an identity follows the
// person — joining a second team never re-uploads), keyed by which side was uploaded.
const USER_COLUMN_BY_KIND = { 'id-front': 'idFrontUrl', 'id-back': 'idBackUrl' } as const;

export const load: PageServerLoad = async (event) => {
	// A blank application is bounced back to its Profile tab (requireLeader) - the
	// layout only links here once a profile exists.
	const { domainUser, ctx } = await requireLeader(event);

	const [managerRows, ambassadorRows, openInvites, isAdmin] = await Promise.all([
		db
			.select()
			.from(managers)
			.innerJoin(users, eq(managers.userId, users.id))
			.innerJoin(authUsers, eq(users.authUserId, authUsers.id))
			.where(and(eq(managers.subjectUserId, ctx.profileUser.id), isNull(managers.deletedAt))),
		db
			.select()
			.from(ambassadors)
			.innerJoin(users, eq(ambassadors.userId, users.id))
			.innerJoin(authUsers, eq(users.authUserId, authUsers.id))
			.where(and(eq(ambassadors.leaderId, ctx.leader.id), isNull(ambassadors.deletedAt))),
		listOpenInvites(ctx.profileUser.id),
		isCampaignAdmin(domainUser.id, ctx)
	]);

	// The sign-off block is embedded under the current user's OWN manager entry —
	// it's their personal attestation, so it reads (and writes) only their own
	// manager row. Other managers see their own under their own entry; nobody sees
	// anyone else's. Shows only while the campaign is still an application.
	const mineRoles = (managerRows.find((r) => r.managers.userId === domainUser.id)?.managers.roles ?? {}) as ManagerRoles;

	return {
		id: domainUser.id,
		isAdmin,
		verified: !!ctx.leader.verifiedAt,
		signoff: {
			myRole: mineRoles.title ?? '',
			nationalId: mineRoles.nationalId ?? '',
			// ID images live on the manager's own users row, not in roles.
			idFrontUrl: domainUser.idFrontUrl,
			idBackUrl: domainUser.idBackUrl
		},
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
	// Sign-off: the current user's attestation, embedded on this tab. Role,
	// national ID, and ID images all save onto their OWN manager row's roles jsonb,
	// so team members never overwrite each other's sign-off.
	saveMyDetails: async (event) => {
		const { domainUser, ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const title = String(form.get('myRole') ?? '').trim();
		const nationalId = String(form.get('nationalId') ?? '').trim();
		if (!isCampaignRole(title)) return fail(400, { error: 'Pick your role in this campaign.' });
		if (!nationalId) return fail(400, { error: 'Enter your national ID number.' });

		const [mine] = await db
			.select({ id: managers.id, roles: managers.roles })
			.from(managers)
			.where(and(eq(managers.userId, domainUser.id), eq(managers.subjectUserId, ctx.profileUser.id), isNull(managers.deletedAt)));
		if (!mine) return fail(403, { error: 'Only team members can save their details.' });

		await db
			.update(managers)
			.set({ roles: { ...((mine.roles ?? {}) as Record<string, unknown>), title, nationalId } })
			.where(eq(managers.id, mine.id));
		return { detailsSaved: true };
	},

	upload: async (event) => {
		const { domainUser, ctx } = await requireLeader(event);
		const form = await event.request.formData();

		const [mine] = await db
			.select({ id: managers.id, roles: managers.roles })
			.from(managers)
			.where(and(eq(managers.userId, domainUser.id), eq(managers.subjectUserId, ctx.profileUser.id), isNull(managers.deletedAt)));
		if (!mine) return fail(403, { error: 'Only team members can upload their ID.' });

		// The ID images land on the uploader's OWN users row, so managers never
		// overwrite each other. Filenames are UUIDs (saveLeaderDocument), so sharing
		// the leader's upload dir is safe.
		const updates: Partial<Record<'idFrontUrl' | 'idBackUrl', string>> = {};
		for (const kind of Object.keys(USER_COLUMN_BY_KIND) as (keyof typeof USER_COLUMN_BY_KIND)[]) {
			const file = form.get(kind);
			if (!(file instanceof File) || file.size === 0) continue; // not (re)uploaded this submit
			try {
				updates[USER_COLUMN_BY_KIND[kind]] = await saveLeaderDocument(ctx.leader.id, kind as UploadKind, file);
			} catch (err) {
				return fail(400, { error: err instanceof Error ? err.message : 'Upload failed.' });
			}
		}
		if (Object.keys(updates).length === 0) return fail(400, { error: 'Choose a file to upload.' });

		await db.update(users).set(updates).where(eq(users.id, domainUser.id));
		return { uploaded: true };
	},

	inviteManager: async (event) => {
		const { domainUser, ctx } = await requireLeader(event);
		if (!(await isCampaignAdmin(domainUser.id, ctx))) {
			return fail(403, { error: 'Only an admin manager can invite other managers.' });
		}
		const form = await event.request.formData();
		const email = String(form.get('email') ?? '').trim();
		if (!email) return fail(400, { error: 'Enter an email address to invite.' });

		const granted = await tryDirectGrant(ctx.profileUser.id, 'manager', email);
		if (granted) return { granted: { email, role: 'Manager' } };

		try {
			await createInvite(ctx.profileUser.id, 'manager', domainUser.id, email, event.url.origin);
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

		const granted = await tryDirectGrant(ctx.profileUser.id, 'ambassador', email);
		if (granted) return { granted: { email, role: 'Ambassador' } };

		try {
			await createInvite(ctx.profileUser.id, 'ambassador', domainUser.id, email, event.url.origin);
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
			.where(and(eq(invites.id, inviteId), eq(invites.subjectUserId, ctx.profileUser.id)));
		if (!invite) return fail(404, { error: 'Invite not found.' });

		if (invite.role === 'manager' && !(await isCampaignAdmin(domainUser.id, ctx))) {
			return fail(403, { error: 'Only an admin manager can revoke manager invites.' });
		}
		await revokeInvite(ctx.profileUser.id, inviteId);
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
			.where(and(eq(managers.id, memberId), eq(managers.subjectUserId, ctx.profileUser.id)));
		if (!member) return fail(404, { error: 'Manager not found.' });

		// Only admins reduce the admin count — removing a plain manager never needs this check.
		const targetIsAdmin = !!(member.roles as { admin?: boolean } | null)?.admin;
		if (targetIsAdmin) {
			// roles is jsonb (no direct SQL predicate on it here) — filter in JS.
			const activeRows = await db
				.select({ roles: managers.roles })
				.from(managers)
				.where(and(eq(managers.subjectUserId, ctx.profileUser.id), eq(managers.isActive, true), isNull(managers.deletedAt)));
			const activeAdminCount = activeRows.filter((r) => (r.roles as { admin?: boolean } | null)?.admin).length;
			if (activeAdminCount < 2) {
				return fail(403, { error: 'Add another admin manager before removing yourself.' });
			}
		}

		// Blueprint rule: removing a manager leaves their ambassadors attached to the campaign.
		await db
			.update(managers)
			.set({ isActive: false, deletedAt: new Date() })
			.where(and(eq(managers.id, memberId), eq(managers.subjectUserId, ctx.profileUser.id)));
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
