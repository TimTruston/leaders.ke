// Ambassador-side view of team assignments: which campaign(s) they mobilize for,
// and self-service leave (a manager can also remove them from /dashboard/team).
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { ambassadors, leaders, positions, users } from '$lib/server/db/schema';
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
