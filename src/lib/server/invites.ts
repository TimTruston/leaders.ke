// onboarding.md: how a worker joins a campaign. A manager/ambassador/follower is
// invited by email; the link is single-use and expires once accepted. Re-inviting
// the same email/role revokes whatever link was open before, so there's only ever
// one live.
import { randomBytes } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { ambassadors, followers, invites, leaders, managers, positions, users } from '$lib/server/db/schema';
import { fullName } from '$lib/server/leader';
import { sendEmail } from '$lib/server/email';

const INVITE_TTL_DAYS = 7;

export type InviteRole = 'manager' | 'ambassador' | 'follower';

export const ROLE_LABEL: Record<InviteRole, string> = { manager: 'a manager', ambassador: 'an ambassador', follower: 'a follower' };

export type OpenInvite = {
	id: number;
	email: string;
	role: InviteRole;
	createdAt: string;
	expiresAt: string | null;
};

export type InviteDetails = {
	role: InviteRole;
	email: string;
	leaderName: string;
	positionTitle: string;
	region: string;
};

/** Creates a fresh invite for this email, revoking any invite still open for the
 * same (leader, role, email) first — one live link per person — and emails it
 * (dev: sendEmail logs the link to the console when no Postmark token is set). */
export async function createInvite(
	leaderId: number,
	role: InviteRole,
	createdBy: number,
	email: string,
	origin: string
): Promise<{ token: string }> {
	const normalizedEmail = email.trim().toLowerCase();

	await db
		.update(invites)
		.set({ deletedAt: new Date() })
		.where(
			and(
				eq(invites.leaderId, leaderId),
				eq(invites.role, role),
				eq(invites.email, normalizedEmail),
				isNull(invites.deletedAt),
				isNull(invites.usedBy)
			)
		);

	const token = randomBytes(24).toString('hex');
	const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
	await db.insert(invites).values({ token, leaderId, role, email: normalizedEmail, createdBy, expiresAt });

	const [leader] = await db
		.select({ firstName: users.firstName, otherNames: users.otherNames })
		.from(leaders)
		.innerJoin(users, eq(leaders.userId, users.id))
		.where(eq(leaders.id, leaderId));
	const leaderName = fullName(leader);
	const link = `${origin}/invite/${token}`;

	await sendEmail({
		to: normalizedEmail,
		subject: `You're invited to join ${leaderName}'s campaign`,
		text: `You've been invited to join ${leaderName}'s campaign as ${ROLE_LABEL[role]} on leaders.ke.\n\nAccept the invite: ${link}\n\nThis link expires in ${INVITE_TTL_DAYS} days and can only be used once.`
	});

	return { token };
}

/** Every invite for this leader that's still usable (not used, not revoked, not expired). */
export async function listOpenInvites(leaderId: number): Promise<OpenInvite[]> {
	const rows = await db
		.select()
		.from(invites)
		.where(and(eq(invites.leaderId, leaderId), isNull(invites.deletedAt), isNull(invites.usedBy)))
		.orderBy(invites.createdAt);

	const now = Date.now();
	return rows
		.filter((r) => !r.expiresAt || r.expiresAt.getTime() > now)
		.map((r) => ({
			id: r.id,
			email: r.email,
			role: r.role,
			createdAt: r.createdAt.toISOString(),
			expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null
		}));
}

export type ReceivedInvite = {
	token: string;
	role: InviteRole;
	leaderName: string;
	leaderPath: string;
	positionTitle: string;
	region: string;
	createdAt: string;
};

/** Every invite (any leader, any role) addressed to this email that's still open —
 * powers the citizen dashboard's Invites tab. */
export async function listInvitesForEmail(email: string): Promise<ReceivedInvite[]> {
	const normalizedEmail = email.trim().toLowerCase();
	const rows = await db
		.select({
			token: invites.token,
			role: invites.role,
			expiresAt: invites.expiresAt,
			createdAt: invites.createdAt,
			firstName: users.firstName,
			otherNames: users.otherNames,
			slug: users.slug,
			positionTitle: positions.title,
			region: positions.region
		})
		.from(invites)
		.innerJoin(leaders, eq(invites.leaderId, leaders.id))
		.innerJoin(users, eq(leaders.userId, users.id))
		.innerJoin(positions, eq(leaders.positionId, positions.id))
		.where(and(eq(invites.email, normalizedEmail), isNull(invites.deletedAt), isNull(invites.usedBy)))
		.orderBy(desc(invites.createdAt));

	const now = Date.now();
	return rows
		.filter((r) => !r.expiresAt || r.expiresAt.getTime() > now)
		.map((r) => ({
			token: r.token,
			role: r.role,
			leaderName: fullName(r),
			leaderPath: r.slug ? `/${r.slug}` : '/leaders',
			positionTitle: r.positionTitle,
			region: r.region,
			createdAt: r.createdAt.toISOString()
		}));
}

/** Revokes an open invite link before it's ever accepted. */
export async function revokeInvite(leaderId: number, inviteId: number) {
	await db
		.update(invites)
		.set({ deletedAt: new Date() })
		.where(and(eq(invites.id, inviteId), eq(invites.leaderId, leaderId)));
}

/** Looks up an invite by token for display on the accept/sign-in page, without consuming it. */
export async function getInviteByToken(token: string): Promise<InviteDetails | null> {
	const [row] = await db
		.select({
			role: invites.role,
			email: invites.email,
			expiresAt: invites.expiresAt,
			usedBy: invites.usedBy,
			deletedAt: invites.deletedAt,
			firstName: users.firstName,
			otherNames: users.otherNames,
			positionTitle: positions.title,
			region: positions.region
		})
		.from(invites)
		.innerJoin(leaders, eq(invites.leaderId, leaders.id))
		.innerJoin(users, eq(leaders.userId, users.id))
		.innerJoin(positions, eq(leaders.positionId, positions.id))
		.where(eq(invites.token, token));

	if (!row || row.usedBy || row.deletedAt) return null;
	if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;

	return {
		role: row.role,
		email: row.email,
		leaderName: fullName({ firstName: row.firstName, otherNames: row.otherNames }),
		positionTitle: row.positionTitle,
		region: row.region
	};
}

/** Accepts an invite: creates the active managers/ambassadors/followers row and
 * marks the token used (single-use). Requires the signed-in email to match who it
 * was sent to — the link itself isn't the only secret, the invite is bound to a person. */
export async function acceptInvite(token: string, userId: number, signedInEmail: string) {
	const [invite] = await db.select().from(invites).where(eq(invites.token, token));
	if (!invite || invite.usedBy || invite.deletedAt) {
		return { ok: false as const, error: 'This invite link is no longer valid.' };
	}
	if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
		return { ok: false as const, error: 'This invite link has expired.' };
	}
	if (invite.email !== signedInEmail.trim().toLowerCase()) {
		return { ok: false as const, error: `This invite was sent to ${invite.email}. Sign in with that email to accept it.` };
	}

	if (invite.role === 'manager') {
		const [existing] = await db
			.select({ id: managers.id })
			.from(managers)
			.where(and(eq(managers.userId, userId), eq(managers.leaderId, invite.leaderId), isNull(managers.deletedAt)));
		if (!existing) {
			await db.insert(managers).values({ userId, leaderId: invite.leaderId, roles: {} });
		}
	} else if (invite.role === 'ambassador') {
		const [existing] = await db
			.select({ id: ambassadors.id })
			.from(ambassadors)
			.where(
				and(eq(ambassadors.userId, userId), eq(ambassadors.leaderId, invite.leaderId), isNull(ambassadors.deletedAt))
			);
		if (!existing) {
			await db.insert(ambassadors).values({ userId, leaderId: invite.leaderId, roles: {} });
		}
	} else {
		const [existing] = await db
			.select({ id: followers.id })
			.from(followers)
			.where(
				and(
					eq(followers.userId, userId),
					eq(followers.digest, 'leader'),
					eq(followers.digestId, invite.leaderId),
					isNull(followers.deletedAt)
				)
			);
		if (!existing) {
			await db.insert(followers).values({ userId, digest: 'leader', digestId: invite.leaderId, email: true });
		}
	}

	await db.update(invites).set({ usedBy: userId, usedAt: new Date() }).where(eq(invites.id, invite.id));
	return { ok: true as const, role: invite.role };
}
