// onboarding.md: how a worker joins a campaign. A manager/ambassador/follower is
// invited by email; the link is single-use and expires once accepted. Re-inviting
// the same email/role revokes whatever link was open before, so there's only ever
// one live.
import { randomBytes } from 'node:crypto';
import { and, count, desc, eq, gt, gte, isNull, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { ambassadors, campaigns, followers, invites, leaders, managers, positions, subscriptions, users } from '$lib/server/db/schema';
import { user as authUsers } from '$lib/server/db/auth.schema';
import { fullName, personIdForLeader } from '$lib/server/leader';
import { sendEmail } from '$lib/server/email';
import { getPlatformSettings } from '$lib/server/settings';

/** This campaign's current paid tier, defaulting to the free/lowest tier
 * ('aspirant') if it has no live campaign row or active subscription yet. */
async function getCampaignTier(leaderId: number): Promise<'aspirant' | 'influencer' | 'mobilizer'> {
	const [row] = await db
		.select({ tier: subscriptions.tier })
		.from(campaigns)
		.innerJoin(subscriptions, eq(subscriptions.campaignId, campaigns.id))
		.where(and(eq(campaigns.leaderId, leaderId), isNull(campaigns.parentCampaignId), isNull(campaigns.deletedAt), eq(subscriptions.status, 'active')))
		.orderBy(desc(subscriptions.startAt))
		.limit(1);
	return row?.tier ?? 'aspirant';
}

/** Whether an auth account already exists for this email — decides whether an
 * invited email should land on /login or /signup, both with the email locked in. */
export async function emailHasAccount(email: string): Promise<boolean> {
	const [row] = await db.select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.email, email.trim().toLowerCase()));
	return !!row;
}

/**
 * If this email already belongs to an active manager OR ambassador of this same
 * leader, grant the new role directly (no invite/email) — they're already a
 * known, trusted member of the team, just missing this one role. Returns null if
 * they're not an existing team member here (caller should fall back to a normal
 * emailed invite).
 */
export async function tryDirectGrant(leaderId: number, role: 'manager' | 'ambassador', email: string): Promise<{ userId: number } | null> {
	const normalizedEmail = email.trim().toLowerCase();

	const [account] = await db
		.select({ userId: users.id })
		.from(authUsers)
		.innerJoin(users, eq(users.authUserId, authUsers.id))
		.where(eq(authUsers.email, normalizedEmail));
	if (!account) return null;

	// Managers attach to the person behind this candidacy term; ambassadors stay per-term.
	const subjectUserId = await personIdForLeader(leaderId);
	const [isManager] = subjectUserId
		? await db
				.select({ id: managers.id })
				.from(managers)
				.where(and(eq(managers.userId, account.userId), eq(managers.subjectUserId, subjectUserId), eq(managers.isActive, true), isNull(managers.deletedAt)))
		: [];
	const [isAmbassador] = await db
		.select({ id: ambassadors.id })
		.from(ambassadors)
		.where(and(eq(ambassadors.userId, account.userId), eq(ambassadors.leaderId, leaderId), eq(ambassadors.isActive, true), isNull(ambassadors.deletedAt)));
	if (!isManager && !isAmbassador) return null;

	if (role === 'manager' && !isManager && subjectUserId) {
		await db.insert(managers).values({ userId: account.userId, subjectUserId, roles: {} });
	} else if (role === 'ambassador' && !isAmbassador) {
		await db.insert(ambassadors).values({ userId: account.userId, leaderId, roles: {} });
	}
	return { userId: account.userId };
}

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
 * (dev: sendEmail logs the link to the console when no Postmark token is set).
 * Throws if: re-inviting the same (leader, role, email) too soon/too often (spam
 * guard — mass mobilization to *unique* emails is never rate-limited), or the
 * campaign has hit its lifetime invite cap for its subscription tier. */
export async function createInvite(
	leaderId: number,
	role: InviteRole,
	createdBy: number,
	email: string,
	origin: string
): Promise<{ token: string }> {
	const normalizedEmail = email.trim().toLowerCase();
	const settings = await getPlatformSettings();

	const [recent] = await db
		.select({ createdAt: invites.createdAt })
		.from(invites)
		.where(and(eq(invites.leaderId, leaderId), eq(invites.role, role), eq(invites.email, normalizedEmail)))
		.orderBy(desc(invites.createdAt))
		.limit(1);
	if (recent) {
		const cooldownMs = settings.otpCooldownSeconds * 1000;
		const elapsed = Date.now() - recent.createdAt.getTime();
		if (elapsed < cooldownMs) {
			throw new Error(`Wait ${Math.ceil((cooldownMs - elapsed) / 1000)}s before re-inviting this email.`);
		}
	}

	const [{ sentToday }] = await db
		.select({ sentToday: count() })
		.from(invites)
		.where(
			and(
				eq(invites.leaderId, leaderId),
				eq(invites.role, role),
				eq(invites.email, normalizedEmail),
				gte(invites.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))
			)
		);
	if (sentToday >= settings.otpDailyCap) {
		throw new Error('Too many invites sent to this email today. Try again tomorrow.');
	}

	const [{ lifetimeCount }] = await db.select({ lifetimeCount: count() }).from(invites).where(eq(invites.leaderId, leaderId));
	const tier = await getCampaignTier(leaderId);
	const limit = settings.inviteLimits[tier];
	if (lifetimeCount >= limit) {
		throw new Error(`This campaign has reached its lifetime invite limit (${limit}) for the ${tier} package.`);
	}

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

/** One page of invites (any leader, any role) addressed to this email that are
 * still open and unexpired — powers the citizen dashboard's Invites tab. Expiry is
 * filtered in SQL so it composes correctly with pagination. */
export async function listInvitesForEmail(
	email: string,
	page: number,
	pageSize: number
): Promise<{ invites: ReceivedInvite[]; total: number }> {
	const normalizedEmail = email.trim().toLowerCase();
	const filter = and(
		eq(invites.email, normalizedEmail),
		isNull(invites.deletedAt),
		isNull(invites.usedBy),
		or(isNull(invites.expiresAt), gt(invites.expiresAt, new Date()))
	);
	const [rows, [{ n: total }]] = await Promise.all([
		db
			.select({
				token: invites.token,
				role: invites.role,
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
			.where(filter)
			.orderBy(desc(invites.createdAt))
			.limit(pageSize)
			.offset((page - 1) * pageSize),
		db.select({ n: count() }).from(invites).where(filter)
	]);

	return {
		invites: rows.map((r) => ({
			token: r.token,
			role: r.role,
			leaderName: fullName(r),
			leaderPath: r.slug ? `/${r.slug}` : '/presidents',
			positionTitle: r.positionTitle,
			region: r.region,
			createdAt: r.createdAt.toISOString()
		})),
		total
	};
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
		// Managers attach to the person behind the invited candidacy term.
		const subjectUserId = await personIdForLeader(invite.leaderId);
		if (!subjectUserId) return { ok: false as const, error: 'This invite link is no longer valid.' };
		const [existing] = await db
			.select({ id: managers.id })
			.from(managers)
			.where(and(eq(managers.userId, userId), eq(managers.subjectUserId, subjectUserId), isNull(managers.deletedAt)));
		if (!existing) {
			await db.insert(managers).values({ userId, subjectUserId, roles: {} });
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

	const [leader] = await db
		.select({ firstName: users.firstName, otherNames: users.otherNames, slug: users.slug, authUserId: users.authUserId, verifiedAt: leaders.verifiedAt })
		.from(leaders)
		.innerJoin(users, eq(leaders.userId, users.id))
		.where(eq(leaders.id, invite.leaderId));

	// The campaign's dashboard home: verified ones live under their slug,
	// in-progress applications under their pre-minted UUID (the phantom's auth id).
	const dashboardBase =
		leader.verifiedAt && leader.slug ? `/dashboard/${leader.slug}` : `/dashboard/apply/${leader.authUserId}`;

	return { ok: true as const, role: invite.role, leaderName: fullName(leader), dashboardBase, leaderId: invite.leaderId };
}

/** Where each accepted role actually lands: managers go straight into the
 * campaign they joined; ambassadors to that campaign's tab on the citizen view;
 * followers to the citizen overview. */
export function inviteDestination(role: InviteRole, dashboardBase: string, leaderId: number): string {
	if (role === 'manager') return `${dashboardBase}/profile`;
	if (role === 'ambassador') return `/dashboard/mobilize/${leaderId}`;
	return '/dashboard';
}

/** Query string for the shared dashboard layout's "you're in" banner. */
export function joinedBannerQuery(role: InviteRole, leaderName: string): string {
	return `joined=${role}&leaderName=${encodeURIComponent(leaderName)}`;
}
