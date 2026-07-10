import { and, desc, eq, gte, isNull, count } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { followers } from '$lib/server/db/schema';
import { requireLeader } from '$lib/server/dashboard';
import type { PageServerLoad } from './$types';

// Follower roster with geo segments; geo values feed the broadcast targeting UI too.
export const load: PageServerLoad = async (event) => {
	const { ctx } = await requireLeader(event);

	const target = and(
		eq(followers.digest, 'leader'),
		eq(followers.digestId, ctx.leader.id),
		isNull(followers.deletedAt)
	);

	const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

	const [rows, [weekRow]] = await Promise.all([
		db.select().from(followers).where(target).orderBy(desc(followers.createdAt)),
		db.select({ n: count() }).from(followers).where(and(target, gte(followers.createdAt, weekAgo)))
	]);

	return {
		followers: rows.map((f) => ({
			id: f.id,
			name: f.name ?? 'Follower',
			emailAddress: f.emailAddress,
			phoneNumber: f.phoneNumber,
			county: f.county,
			ward: f.ward,
			channels: [f.email && 'email', f.sms && 'sms', f.whatsapp && 'whatsapp'].filter(
				Boolean
			) as string[],
			joinedAt: f.createdAt.toISOString()
		})),
		newThisWeek: weekRow.n
	};
};
