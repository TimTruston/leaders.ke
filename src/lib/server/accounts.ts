// Admin "Accounts" tab: every platform user and the roles they hold. Granting
// platform-admin access is CLI/psql-only (adminAt), not something this UI does.
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { ambassadors, leaders, managers, users } from '$lib/server/db/schema';
import { user as authUsers } from '$lib/server/db/auth.schema';
import { fullName } from '$lib/server/leader';

export type AccountRow = {
	userId: number;
	name: string;
	email: string;
	isAdmin: boolean;
	isLeader: boolean;
	isManager: boolean;
	isAmbassador: boolean;
	createdAt: string;
};

export type AccountPage = { accounts: AccountRow[]; total: number };

export async function listAccounts(page: number, pageSize: number): Promise<AccountPage> {
	const [userRows, leaderUserIds, managerUserIds, ambassadorUserIds, [{ total }]] = await Promise.all([
		db
			.select({
				id: users.id,
				firstName: users.firstName,
				otherNames: users.otherNames,
				adminAt: users.adminAt,
				createdAt: users.createdAt,
				email: authUsers.email
			})
			.from(users)
			.innerJoin(authUsers, eq(users.authUserId, authUsers.id))
			.where(isNull(users.deletedAt))
			.orderBy(desc(users.createdAt))
			.limit(pageSize)
			.offset((page - 1) * pageSize),
		db.select({ userId: leaders.userId }).from(leaders).where(isNull(leaders.deletedAt)),
		db
			.select({ userId: managers.userId })
			.from(managers)
			.where(and(isNull(managers.deletedAt), eq(managers.isActive, true))),
		db
			.select({ userId: ambassadors.userId })
			.from(ambassadors)
			.where(and(isNull(ambassadors.deletedAt), eq(ambassadors.isActive, true))),
		db.select({ total: count() }).from(users).where(isNull(users.deletedAt))
	]);

	const leaderSet = new Set(leaderUserIds.map((r) => r.userId));
	const managerSet = new Set(managerUserIds.map((r) => r.userId));
	const ambassadorSet = new Set(ambassadorUserIds.map((r) => r.userId));

	return {
		total,
		accounts: userRows.map((u) => ({
			userId: u.id,
			name: fullName(u),
			email: u.email,
			isAdmin: !!u.adminAt,
			isLeader: leaderSet.has(u.id),
			isManager: managerSet.has(u.id),
			isAmbassador: ambassadorSet.has(u.id),
			createdAt: u.createdAt.toISOString()
		}))
	};
}
