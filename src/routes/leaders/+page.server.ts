import { and, count, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { followers, leaders, parties, partyMemberships, positions, users } from '$lib/server/db/schema';
import { fullName, leaderPath, slugify } from '$lib/server/leader';
import type { PageServerLoad } from './$types';

// Real leader profiles for the directory. Only verified profiles are public here.
export const load: PageServerLoad = async () => {
	const rows = await db
		.select()
		.from(leaders)
		.innerJoin(positions, eq(leaders.positionId, positions.id))
		.innerJoin(users, eq(leaders.userId, users.id))
		.where(and(isNull(leaders.deletedAt), isNotNull(leaders.verifiedAt)));

	const leaderIds = rows.map((r) => r.leaders.id);

	// One grouped query for every follower count, instead of one query per leader.
	const followerCounts = leaderIds.length
		? await db
				.select({ leaderId: followers.digestId, n: count() })
				.from(followers)
				.where(and(eq(followers.digest, 'leader'), inArray(followers.digestId, leaderIds), isNull(followers.deletedAt)))
				.groupBy(followers.digestId)
		: [];
	const followersByLeaderId = new Map(followerCounts.map((f) => [f.leaderId, f.n]));

	// One grouped query for every current party membership, instead of a per-leader lookup.
	const memberships = leaderIds.length
		? await db
				.select({ leaderId: partyMemberships.leaderId, partyName: parties.name })
				.from(partyMemberships)
				.innerJoin(parties, eq(partyMemberships.partyId, parties.id))
				.where(and(inArray(partyMemberships.leaderId, leaderIds), isNull(partyMemberships.deletedAt), isNull(partyMemberships.endAt)))
		: [];
	const partyByLeaderId = new Map(memberships.map((m) => [m.leaderId, m.partyName]));

	// A person can have several `leaders` rows (Track Record); they all share one
	// slug/URL, so keep just one card per slug — preferring their non-'former' row,
	// and among former-only rows the most recent term.
	const bySlug = new Map<string, (typeof rows)[number]>();
	for (const r of rows) {
		if (!r.users.slug) continue;
		const existing = bySlug.get(r.users.slug);
		const better =
			!existing ||
			(existing.leaders.status === 'former' &&
				(r.leaders.status !== 'former' ||
					(r.leaders.endAt?.getTime() ?? 0) > (existing.leaders.endAt?.getTime() ?? 0)));
		if (better) bySlug.set(r.users.slug, r);
	}

	// Directory order: current officeholders first, then aspirants, then former.
	const STATUS_ORDER: Record<string, number> = { current: 0, aspirant: 1, former: 2 };
	const dbLeaders = [...bySlug.values()].map((r) => {
		const name = fullName(r.users);
		return {
			slug: r.users.slug,
			path: leaderPath(r.users),
			name,
			initials: name
				.split(/\s+/)
				.map((w) => w[0])
				.join('')
				.slice(0, 2)
				.toUpperCase(),
			photoUrl: r.leaders.photoUrl,
			party: partyByLeaderId.get(r.leaders.id) ?? null,
			partyPath: partyByLeaderId.has(r.leaders.id)
				? `/parties/${slugify(partyByLeaderId.get(r.leaders.id)!)}`
				: null,
			countyLabel: r.positions.region,
			positionTitle: r.positions.title,
			status: r.leaders.status,
			verified: !!r.leaders.verifiedAt,
			followers: followersByLeaderId.get(r.leaders.id) ?? 0,
			// Former leaders rank by how recently their term ended (oldest last).
			termEnd: (r.leaders.endAt ?? r.leaders.startAt)?.getTime() ?? 0
		};
	});
	dbLeaders.sort(
		(a, b) =>
			(STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3) ||
			(a.status === 'former' ? b.termEnd - a.termEnd : 0) ||
			b.followers - a.followers ||
			a.name.localeCompare(b.name)
	);

	return { dbLeaders };
};
