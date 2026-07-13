// Admin "Candidates" tab: every leader row on the platform, aspirant through former,
// so an admin can see the full roster in one table without hunting through /leaders.
import { count, desc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { leaders, positions, users } from '$lib/server/db/schema';
import { fullName, leaderPath } from '$lib/server/leader';

export type CandidateRow = {
	leaderId: number;
	name: string;
	path: string;
	positionTitle: string;
	region: string;
	status: string;
	verified: boolean;
};

export type CandidatePage = { candidates: CandidateRow[]; total: number };

export async function listCandidates(page: number, pageSize: number): Promise<CandidatePage> {
	const [rows, [{ total }]] = await Promise.all([
		db
			.select()
			.from(leaders)
			.innerJoin(users, eq(leaders.userId, users.id))
			.innerJoin(positions, eq(leaders.positionId, positions.id))
			.where(isNull(leaders.deletedAt))
			.orderBy(desc(leaders.createdAt))
			.limit(pageSize)
			.offset((page - 1) * pageSize),
		db.select({ total: count() }).from(leaders).where(isNull(leaders.deletedAt))
	]);

	return {
		total,
		candidates: rows.map((r) => ({
			leaderId: r.leaders.id,
			name: fullName(r.users),
			path: leaderPath(r.users),
			positionTitle: r.positions.title,
			region: r.positions.region,
			status: r.leaders.status,
			verified: !!r.leaders.verifiedAt
		}))
	};
}
