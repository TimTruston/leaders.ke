import { error } from '@sveltejs/kit';
import { and, count, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { followers, leaders, parties, partyMemberships, positions, users } from '$lib/server/db/schema';
import { fullName, leaderPath, slugify } from '$lib/server/leader';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const rows = await db.select().from(parties).where(isNull(parties.deletedAt));
	const party = rows.find((p) => slugify(p.name) === params.party);
	if (!party) error(404, 'Party not found');

	const memberRows = await db
		.select()
		.from(partyMemberships)
		.innerJoin(leaders, eq(partyMemberships.leaderId, leaders.id))
		.innerJoin(positions, eq(leaders.positionId, positions.id))
		.innerJoin(users, eq(leaders.userId, users.id))
		.where(
			and(
				eq(partyMemberships.partyId, party.id),
				isNull(partyMemberships.deletedAt),
				isNull(partyMemberships.endAt),
				isNull(leaders.deletedAt)
			)
		);

	// Follower counts for all members in one grouped query.
	const memberLeaderIds = memberRows.map((r) => r.leaders.id);
	const followerRows = memberLeaderIds.length
		? await db
				.select({ leaderId: followers.digestId, n: count() })
				.from(followers)
				.where(and(eq(followers.digest, 'leader'), inArray(followers.digestId, memberLeaderIds), isNull(followers.deletedAt)))
				.groupBy(followers.digestId)
		: [];
	const followersByLeaderId = new Map(followerRows.map((r) => [r.leaderId, r.n]));

	return {
		party: {
			name: party.name,
			abbreviation: party.abbreviation,
			slogan: party.slogan,
			description: party.description,
			symbol: party.symbol,
			colors: party.colors,
			status: party.status
		},
		members: memberRows.map((r) => {
			const name = fullName(r.users);
			return {
				name,
				initials: name
					.split(/\s+/)
					.map((w) => w[0])
					.join('')
					.slice(0, 2)
					.toUpperCase(),
				path: leaderPath(r.users),
				photoUrl: r.users.photoUrl,
				verified: !!r.leaders.verifiedAt,
				status: r.leaders.status,
				followers: followersByLeaderId.get(r.leaders.id) ?? 0,
				role: r.party_memberships.role,
				positionTitle: r.positions.title,
				region: r.positions.region
			};
		})
	};
};
