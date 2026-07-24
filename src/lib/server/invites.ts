// onboarding.md: how a worker joins a leader's team. A manager/ambassador/follower is
// invited by email; the link is single-use and expires once accepted. Re-inviting
// the same email/role revokes whatever link was open before, so there's only ever
// one live. Invites are PERSON-scoped (you join someone's team, not one candidacy):
// manager rows land on the person; an ambassador accept resolves the person to their
// active term at accept time (ambassadors are per-run).
import { randomBytes } from 'node:crypto';
import { and, count, desc, eq, gt, gte, isNull, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { ambassadors, followers, invites, leaders, managers, positions, subscriptions, users } from '$lib/server/db/schema';
import { user as authUsers } from '$lib/server/db/auth.schema';
import { activeTermForPerson, fullName, getRunCampaign } from '$lib/server/leader';
import { sendEmail } from '$lib/server/email';
import { getPlatformSettings } from '$lib/server/settings';

/** This person's current paid tier, defaulting to the lowest tier ('kickstart')
 * when they have no active subscription (billing is user-scoped). */
async function getPersonTier(subjectUserId: number): Promise<'kickstart' | 'mobilize' | 'dominate'> {
	const [row] = await db
		.select({ tier: subscriptions.tier })
		.from(subscriptions)
		.where(and(eq(subscriptions.subjectUserId, subjectUserId), eq(subscriptions.status, 'active')))
		.orderBy(desc(subscriptions.startAt))
		.limit(1);
	return row?.tier ?? 'kickstart';
}

/** Whether an auth account already exists for this email — decides whether an
 * invited email should land on /login or /signup, both with the email locked in. */
export async function emailHasAccount(email: string): Promise<boolean> {
	const [row] = await db.select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.email, email.trim().toLowerCase()));
	return !!row;
}

/**
 * If this email already belongs to an active manager OR ambassador of this same
 * person, grant the new role directly (no invite/email) — they're already a
 * known, trusted member of the team, just missing this one role. Returns null if
 * they're not an existing team member here (caller should fall back to a normal
 * emailed invite).
 */
export async function tryDirectGrant(subjectUserId: number, role: 'manager' | 'ambassador', email: string): Promise<{ userId: number } | null> {
	const normalizedEmail = email.trim().toLowerCase();

	const [account] = await db
		.select({ userId: users.id })
		.from(authUsers)
		.innerJoin(users, eq(users.authUserId, authUsers.id))
		.where(eq(authUsers.email, normalizedEmail));
	if (!account) return null;

	const [isManager] = await db
		.select({ id: managers.id })
		.from(managers)
		.where(and(eq(managers.userId, account.userId), eq(managers.subjectUserId, subjectUserId), eq(managers.isActive, true), isNull(managers.deletedAt)));
	// Ambassadors attach to the PERSON (subjectUserId), so a pure aspirant with no
	// leaders term can still take them on.
	const [isAmbassador] = await db
		.select({ id: ambassadors.id })
		.from(ambassadors)
		.where(and(eq(ambassadors.userId, account.userId), eq(ambassadors.subjectUserId, subjectUserId), eq(ambassadors.isActive, true), isNull(ambassadors.deletedAt)));
	if (!isManager && !isAmbassador) return null;

	if (role === 'manager' && !isManager) {
		await db.insert(managers).values({ userId: account.userId, subjectUserId, roles: {} });
	} else if (role === 'ambassador' && !isAmbassador) {
		await db.insert(ambassadors).values({ userId: account.userId, subjectUserId, roles: {} });
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
 * same (person, role, email) first — one live link per invitee — and emails it
 * (dev: sendEmail logs the link to the console when no Postmark token is set).
 * Throws if: re-inviting the same (person, role, email) too soon/too often (spam
 * guard — mass mobilization to *unique* emails is never rate-limited), or the
 * person has hit their lifetime invite cap for their subscription tier. */
export async function createInvite(
	subjectUserId: number,
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
		.where(and(eq(invites.subjectUserId, subjectUserId), eq(invites.role, role), eq(invites.email, normalizedEmail)))
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
				eq(invites.subjectUserId, subjectUserId),
				eq(invites.role, role),
				eq(invites.email, normalizedEmail),
				gte(invites.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))
			)
		);
	if (sentToday >= settings.otpDailyCap) {
		throw new Error('Too many invites sent to this email today. Try again tomorrow.');
	}

	const [{ lifetimeCount }] = await db.select({ lifetimeCount: count() }).from(invites).where(eq(invites.subjectUserId, subjectUserId));
	const tier = await getPersonTier(subjectUserId);
	const limit = settings.inviteLimits[tier];
	if (lifetimeCount >= limit) {
		throw new Error(`This team has reached its lifetime invite limit (${limit}) for the ${tier} package.`);
	}

	await db
		.update(invites)
		.set({ deletedAt: new Date() })
		.where(
			and(
				eq(invites.subjectUserId, subjectUserId),
				eq(invites.role, role),
				eq(invites.email, normalizedEmail),
				isNull(invites.deletedAt),
				isNull(invites.usedBy)
			)
		);

	const token = randomBytes(24).toString('hex');
	const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
	await db.insert(invites).values({ token, subjectUserId, role, email: normalizedEmail, createdBy, expiresAt });

	const [leader] = await db
		.select({ firstName: users.firstName, otherNames: users.otherNames })
		.from(users)
		.where(eq(users.id, subjectUserId));
	const leaderName = fullName(leader);
	const link = `${origin}/invite/${token}`;

	await sendEmail({
		to: normalizedEmail,
		subject: `You're invited to join ${leaderName}'s campaign`,
		text: `You've been invited to join ${leaderName}'s campaign as ${ROLE_LABEL[role]} on leaders.ke.\n\nAccept the invite: ${link}\n\nThis link expires in ${INVITE_TTL_DAYS} days and can only be used once.`
	});

	return { token };
}

/** Every invite for this person that's still usable (not used, not revoked, not expired). */
export async function listOpenInvites(subjectUserId: number): Promise<OpenInvite[]> {
	const rows = await db
		.select()
		.from(invites)
		.where(and(eq(invites.subjectUserId, subjectUserId), isNull(invites.deletedAt), isNull(invites.usedBy)))
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

/** One page of invites (any person, any role) addressed to this email that are
 * still open and unexpired — powers the citizen dashboard's Invites tab. Expiry is
 * filtered in SQL so it composes correctly with pagination; the inviting person's
 * seat (their active term) is resolved per row, the page is small. */
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
				subjectUserId: invites.subjectUserId,
				firstName: users.firstName,
				otherNames: users.otherNames,
				slug: users.slug
			})
			.from(invites)
			.innerJoin(users, eq(invites.subjectUserId, users.id))
			.where(filter)
			.orderBy(desc(invites.createdAt))
			.limit(pageSize)
			.offset((page - 1) * pageSize),
		db.select({ n: count() }).from(invites).where(filter)
	]);

	return {
		invites: await Promise.all(
			rows.map(async (r) => {
				const term = await activeTermForPerson(r.subjectUserId);
				// A pure aspirant (no leaders row yet) has only a run — fall back to its
				// seat so the invite still shows a position/region instead of blanks.
				let positionTitle = term?.positions.title ?? '';
				let region = term?.positions.region ?? '';
				if (!term) {
					const run = await getRunCampaign(r.subjectUserId);
					if (run) {
						const [position] = await db.select({ title: positions.title, region: positions.region }).from(positions).where(eq(positions.id, run.positionId));
						positionTitle = position?.title ?? '';
						region = position?.region ?? '';
					}
				}
				return {
					token: r.token,
					role: r.role,
					leaderName: fullName(r),
					leaderPath: r.slug ? `/${r.slug}` : '/presidents',
					positionTitle,
					region,
					createdAt: r.createdAt.toISOString()
				};
			})
		),
		total
	};
}

/** Revokes an open invite link before it's ever accepted. */
export async function revokeInvite(subjectUserId: number, inviteId: number) {
	await db
		.update(invites)
		.set({ deletedAt: new Date() })
		.where(and(eq(invites.id, inviteId), eq(invites.subjectUserId, subjectUserId)));
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
			subjectUserId: invites.subjectUserId,
			firstName: users.firstName,
			otherNames: users.otherNames
		})
		.from(invites)
		.innerJoin(users, eq(invites.subjectUserId, users.id))
		.where(eq(invites.token, token));

	if (!row || row.usedBy || row.deletedAt) return null;
	if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;

	const term = await activeTermForPerson(row.subjectUserId);
	return {
		role: row.role,
		email: row.email,
		leaderName: fullName({ firstName: row.firstName, otherNames: row.otherNames }),
		positionTitle: term?.positions.title ?? '',
		region: term?.positions.region ?? ''
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

	// Ambassador/follower placement needs the person's active term (per-run rows).
	const activeTerm = await activeTermForPerson(invite.subjectUserId);

	if (invite.role === 'manager') {
		const [existing] = await db
			.select({ id: managers.id })
			.from(managers)
			.where(and(eq(managers.userId, userId), eq(managers.subjectUserId, invite.subjectUserId), isNull(managers.deletedAt)));
		if (!existing) {
			await db.insert(managers).values({ userId, subjectUserId: invite.subjectUserId, roles: {} });
		}
	} else if (invite.role === 'ambassador') {
		// Ambassadors attach to the PERSON, so no active term is required (an
		// aspirant with only a run can still onboard ambassadors).
		const [existing] = await db
			.select({ id: ambassadors.id })
			.from(ambassadors)
			.where(
				and(eq(ambassadors.userId, userId), eq(ambassadors.subjectUserId, invite.subjectUserId), isNull(ambassadors.deletedAt))
			);
		if (!existing) {
			await db.insert(ambassadors).values({ userId, subjectUserId: invite.subjectUserId, roles: {} });
		}
	} else {
		// Follows are person-scoped: digestId is the followed person's users.id.
		const [existing] = await db
			.select({ id: followers.id })
			.from(followers)
			.where(
				and(
					eq(followers.userId, userId),
					eq(followers.digest, 'leader'),
					eq(followers.digestId, invite.subjectUserId),
					isNull(followers.deletedAt)
				)
			);
		if (!existing) {
			await db.insert(followers).values({ userId, digest: 'leader', digestId: invite.subjectUserId, email: true });
		}
	}

	await db.update(invites).set({ usedBy: userId, usedAt: new Date() }).where(eq(invites.id, invite.id));

	const [person] = await db
		.select({ firstName: users.firstName, otherNames: users.otherNames, slug: users.slug, authUserId: users.authUserId })
		.from(users)
		.where(eq(users.id, invite.subjectUserId));

	// The team's dashboard home — a slug always exists (onboarding mints it at
	// payment time, before anyone can be invited onto the team).
	const dashboardBase = `/dashboard/${person.slug}`;

	return { ok: true as const, role: invite.role, leaderName: fullName(person), dashboardBase, subjectId: invite.subjectUserId };
}

/** Where each accepted role actually lands: managers go straight into the
 * campaign they joined; ambassadors to that campaign's tab on the citizen view;
 * followers to the citizen overview. */
export function inviteDestination(role: InviteRole, dashboardBase: string, subjectId: number): string {
	if (role === 'manager') return `${dashboardBase}/profile`;
	if (role === 'ambassador') return `/dashboard/mobilize/${subjectId}`;
	return '/dashboard';
}

/** Query string for the shared dashboard layout's "you're in" banner. */
export function joinedBannerQuery(role: InviteRole, leaderName: string): string {
	return `joined=${role}&leaderName=${encodeURIComponent(leaderName)}`;
}
