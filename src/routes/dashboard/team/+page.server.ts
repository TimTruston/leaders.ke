import { fail } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { ambassadors, managers, users } from '$lib/server/db/schema';
import { user as authUsers } from '$lib/server/db/auth.schema';
import { requireLeader } from '$lib/server/dashboard';
import { fullName } from '$lib/server/leader';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { ctx } = await requireLeader(event);

	const [managerRows, ambassadorRows] = await Promise.all([
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
			.where(and(eq(ambassadors.leaderId, ctx.leader.id), isNull(ambassadors.deletedAt)))
	]);

	return {
		managers: managerRows.map((r) => ({
			id: r.managers.id,
			name: fullName(r.users),
			email: r.user.email,
			active: r.managers.isActive
		})),
		ambassadors: ambassadorRows.map((r) => ({
			id: r.ambassadors.id,
			name: fullName(r.users),
			email: r.user.email,
			active: r.ambassadors.isActive
		}))
	};
};

/** Resolves an invite email to a domain user; team members must sign up first. */
async function findInvitee(email: string) {
	const [row] = await db
		.select({ domainUser: users })
		.from(authUsers)
		.innerJoin(users, eq(users.authUserId, authUsers.id))
		.where(eq(authUsers.email, email.toLowerCase()));
	return row?.domainUser;
}

export const actions: Actions = {
	inviteManager: async (event) => {
		const { ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const email = String(form.get('email') ?? '').trim();
		if (!email) return fail(400, { error: 'Enter the invitee’s email.' });

		const invitee = await findInvitee(email);
		if (!invitee) {
			return fail(400, { error: 'No leaders.ke account with that email. Ask them to sign up first.' });
		}
		if (invitee.id === ctx.leader.userId) {
			return fail(400, { error: 'The candidate already owns this campaign.' });
		}

		const [existing] = await db
			.select()
			.from(managers)
			.where(
				and(
					eq(managers.userId, invitee.id),
					eq(managers.leaderId, ctx.leader.id),
					isNull(managers.deletedAt)
				)
			);
		if (existing) return fail(400, { error: 'They are already a manager on this campaign.' });

		await db.insert(managers).values({
			userId: invitee.id,
			leaderId: ctx.leader.id,
			roles: { title: 'Manager' }
		});
		return { saved: true };
	},

	inviteAmbassador: async (event) => {
		const { ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const email = String(form.get('email') ?? '').trim();
		if (!email) return fail(400, { error: 'Enter the invitee’s email.' });

		const invitee = await findInvitee(email);
		if (!invitee) {
			return fail(400, { error: 'No leaders.ke account with that email. Ask them to sign up first.' });
		}

		const [existing] = await db
			.select()
			.from(ambassadors)
			.where(
				and(
					eq(ambassadors.userId, invitee.id),
					eq(ambassadors.leaderId, ctx.leader.id),
					isNull(ambassadors.deletedAt)
				)
			);
		if (existing) return fail(400, { error: 'They are already an ambassador on this campaign.' });

		await db.insert(ambassadors).values({
			userId: invitee.id,
			leaderId: ctx.leader.id,
			roles: { title: 'Ambassador' }
		});
		return { saved: true };
	},

	removeManager: async (event) => {
		const { ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const memberId = Number(form.get('memberId') ?? 0);

		// Blueprint rule: removing a manager leaves their ambassadors attached to the campaign.
		await db
			.update(managers)
			.set({ isActive: false, deletedAt: new Date() })
			.where(and(eq(managers.id, memberId), eq(managers.leaderId, ctx.leader.id)));
		return { saved: true };
	},

	removeAmbassador: async (event) => {
		const { ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const memberId = Number(form.get('memberId') ?? 0);

		// Blueprint rule: removing an ambassador leaves their subscribers attached to the campaign.
		await db
			.update(ambassadors)
			.set({ isActive: false, deletedAt: new Date() })
			.where(and(eq(ambassadors.id, memberId), eq(ambassadors.leaderId, ctx.leader.id)));
		return { saved: true };
	}
};
