// Ambassador-side view of team assignments: which campaign(s) they mobilize for,
// self-service leave (a manager can also remove them from /dashboard/team), and
// citizen recruitment (blueprint funnel A: ambassador adds citizen via dashboard).
import { and, count, desc, eq, isNull, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { ambassadors, followers, leaders, positions, users } from '$lib/server/db/schema';
import { fullName, leaderPath } from '$lib/server/leader';

export type AmbassadorAssignment = {
	id: number;
	leaderId: number;
	leaderName: string;
	positionTitle: string;
	region: string;
	leaderPath: string;
};

/** This user's active ambassador assignments, across every campaign they mobilize for. */
export async function listAmbassadorAssignments(userId: number): Promise<AmbassadorAssignment[]> {
	const rows = await db
		.select()
		.from(ambassadors)
		.innerJoin(leaders, eq(ambassadors.leaderId, leaders.id))
		.innerJoin(users, eq(leaders.userId, users.id))
		.innerJoin(positions, eq(leaders.positionId, positions.id))
		.where(and(eq(ambassadors.userId, userId), eq(ambassadors.isActive, true), isNull(ambassadors.deletedAt)));

	return rows.map((r) => ({
		id: r.ambassadors.id,
		leaderId: r.leaders.id,
		leaderName: fullName(r.users),
		positionTitle: r.positions.title,
		region: r.positions.region,
		leaderPath: leaderPath(r.users)
	}));
}

/** Self-service leave: scoped to the caller's own row so they can't remove someone else's. */
export async function leaveAmbassadorRole(ambassadorId: number, userId: number) {
	await db
		.update(ambassadors)
		.set({ isActive: false, deletedAt: new Date() })
		.where(and(eq(ambassadors.id, ambassadorId), eq(ambassadors.userId, userId)));
}

/** Whether this user actively mobilizes for this campaign — the write guard for
 * every ambassador action scoped to a leaderId. */
export async function isActiveAmbassador(userId: number, leaderId: number): Promise<boolean> {
	const [row] = await db
		.select({ id: ambassadors.id })
		.from(ambassadors)
		.where(
			and(
				eq(ambassadors.userId, userId),
				eq(ambassadors.leaderId, leaderId),
				eq(ambassadors.isActive, true),
				isNull(ambassadors.deletedAt)
			)
		);
	return !!row;
}

/**
 * Adds a citizen to a campaign's follower roster on an ambassador's behalf —
 * same shape and contact dedupe as the public follow form, plus `addedBy` so the
 * recruit stays attributed to whoever signed them up (the follower row itself
 * stays attached to the campaign if the ambassador is later removed).
 */
export async function addCitizenFollower(
	recruiterUserId: number,
	leaderId: number,
	input: { name: string; phone: string; email: string; county: string | null; ward: string | null }
) {
	const name = input.name.trim();
	const email = input.email.trim().toLowerCase();
	const phone = input.phone.replace(/[^\d+]/g, '');
	if (!name || (!phone && !email)) {
		return { ok: false as const, error: 'A name and a phone or email are required.' };
	}
	if (phone && phone.length < 9) return { ok: false as const, error: 'Enter a valid phone number.' };
	if (email && !email.includes('@')) return { ok: false as const, error: 'Enter a valid email address.' };
	const emailAddress = email || null;
	const phoneNumber = phone || null;

	// App-layer dedupe for account-less follows: one live follow per contact per leader.
	const [duplicate] = await db
		.select({ id: followers.id })
		.from(followers)
		.where(
			and(
				eq(followers.digest, 'leader'),
				eq(followers.digestId, leaderId),
				isNull(followers.deletedAt),
				or(
					emailAddress ? eq(followers.emailAddress, emailAddress) : undefined,
					phoneNumber ? eq(followers.phoneNumber, phoneNumber) : undefined
				)
			)
		)
		.limit(1);
	if (duplicate) return { ok: false as const, error: 'That contact already follows this campaign.' };

	await db.insert(followers).values({
		name,
		emailAddress,
		phoneNumber,
		county: input.county,
		ward: input.ward || null,
		digest: 'leader',
		digestId: leaderId,
		// Each provided contact channel doubles as a digest opt-in.
		email: !!emailAddress,
		sms: !!phoneNumber,
		addedBy: recruiterUserId
	});
	return { ok: true as const, name };
}

export type Recruit = {
	id: number;
	name: string;
	phone: string | null;
	email: string | null;
	ward: string | null;
	joinedAt: string;
};

/** One page of the citizens this user recruited for this campaign, newest first —
 * the ambassador view is scoped to their own recruits, never the full roster. */
export async function listRecruits(
	recruiterUserId: number,
	leaderId: number,
	page: number,
	pageSize: number
): Promise<{ recruits: Recruit[]; total: number }> {
	const filter = and(
		eq(followers.digest, 'leader'),
		eq(followers.digestId, leaderId),
		eq(followers.addedBy, recruiterUserId),
		isNull(followers.deletedAt)
	);
	const [rows, [{ n: total }]] = await Promise.all([
		db
			.select()
			.from(followers)
			.where(filter)
			.orderBy(desc(followers.createdAt))
			.limit(pageSize)
			.offset((page - 1) * pageSize),
		db.select({ n: count() }).from(followers).where(filter)
	]);

	return {
		recruits: rows.map((f) => ({
			id: f.id,
			name: f.name ?? 'Follower',
			phone: f.phoneNumber,
			email: f.emailAddress,
			ward: f.ward,
			joinedAt: f.createdAt.toISOString()
		})),
		total
	};
}
