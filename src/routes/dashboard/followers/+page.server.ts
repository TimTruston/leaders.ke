import { and, desc, eq, gte, isNull, count } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { followers } from '$lib/server/db/schema';
import { requireLeader } from '$lib/server/dashboard';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 50;

// Follower roster with geo segments; geo values feed the broadcast targeting UI too.
// Ward filtering happens server-side so it composes correctly with pagination.
export const load: PageServerLoad = async (event) => {
	const { ctx } = await requireLeader(event);

	const target = and(
		eq(followers.digest, 'leader'),
		eq(followers.digestId, ctx.leader.id),
		isNull(followers.deletedAt)
	);

	const ward = event.url.searchParams.get('ward') || null;
	const page = Math.max(1, Number(event.url.searchParams.get('page') ?? 1));
	const filtered = ward ? and(target, eq(followers.ward, ward)) : target;

	const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

	const [rows, [weekRow], [totalRow], wardRows] = await Promise.all([
		db
			.select()
			.from(followers)
			.where(filtered)
			.orderBy(desc(followers.createdAt))
			.limit(PAGE_SIZE)
			.offset((page - 1) * PAGE_SIZE),
		db.select({ n: count() }).from(followers).where(and(target, gte(followers.createdAt, weekAgo))),
		db.select({ n: count() }).from(followers).where(filtered),
		db.selectDistinct({ ward: followers.ward }).from(followers).where(target)
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
		newThisWeek: weekRow.n,
		total: totalRow.n,
		page,
		pageSize: PAGE_SIZE,
		ward,
		wards: wardRows.map((w) => w.ward).filter((w): w is string => !!w).sort()
	};
};
