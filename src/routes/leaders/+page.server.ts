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

	// One entry PER TERM, so the client can render any regime's view of the
	// directory (a multi-regime person appears in every era they served, wearing
	// that era's seat). Person-level facts (photo, party, followers) come from
	// their best row so every term's card looks complete.
	const photoBySlug = new Map<string, string>();
	const partyBySlug = new Map<string, string>();
	const followersBySlug = new Map<string, number>();
	for (const r of rows) {
		if (!r.users.slug) continue;
		if (r.leaders.photoUrl && !photoBySlug.has(r.users.slug)) photoBySlug.set(r.users.slug, r.leaders.photoUrl);
		const party = partyByLeaderId.get(r.leaders.id);
		if (party && (!partyBySlug.has(r.users.slug) || r.leaders.status !== 'former')) partyBySlug.set(r.users.slug, party);
		followersBySlug.set(
			r.users.slug,
			(followersBySlug.get(r.users.slug) ?? 0) + (followersByLeaderId.get(r.leaders.id) ?? 0)
		);
	}

	const dbLeaders = rows
		.filter((r) => r.users.slug)
		.map((r) => {
			const name = fullName(r.users);
			const slug = r.users.slug!;
			const party = partyBySlug.get(slug) ?? null;
			return {
				slug,
				path: leaderPath(r.users),
				name,
				initials: name
					.split(/\s+/)
					.map((w) => w[0])
					.join('')
					.slice(0, 2)
					.toUpperCase(),
				photoUrl: photoBySlug.get(slug) ?? null,
				party,
				partyPath: party ? `/parties/${slugify(party)}` : null,
				countyLabel: r.positions.region,
				positionTitle: r.positions.title,
				status: r.leaders.status,
				verified: !!r.leaders.verifiedAt,
				followers: followersBySlug.get(slug) ?? 0,
				termStart: r.leaders.startAt.getTime(),
				termEnd: r.leaders.endAt?.getTime() ?? null
			};
		});

	return { dbLeaders };
};
