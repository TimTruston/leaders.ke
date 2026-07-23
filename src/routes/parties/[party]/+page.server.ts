import { error } from '@sveltejs/kit';
import { and, count, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, followers, leaders, parties, partyMemberships, positions, users } from '$lib/server/db/schema';
import { ACTIVE_CYCLE, fullName, leaderPath, slugify } from '$lib/server/leader';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const rows = await db.select().from(parties).where(isNull(parties.deletedAt));
	const party = rows.find((p) => slugify(p.name) === params.party);
	if (!party) error(404, 'Party not found');

	const partyData = {
		name: party.name,
		abbreviation: party.abbreviation,
		slogan: party.slogan,
		description: party.description,
		symbol: party.symbol,
		colors: party.colors,
		status: party.status
	};

	// Members are PEOPLE (membership is person-scoped); the seat shown per member is
	// resolved below from their held terms and 2027 runs.
	const memberRows = await db
		.select({ role: partyMemberships.role, users })
		.from(partyMemberships)
		.innerJoin(users, eq(partyMemberships.subjectUserId, users.id))
		.where(
			and(
				eq(partyMemberships.partyId, party.id),
				isNull(partyMemberships.deletedAt),
				isNull(partyMemberships.endAt),
				isNull(users.deletedAt)
			)
		);
	const memberIds = memberRows.map((r) => r.users.id);
	if (memberIds.length === 0) return { party: partyData, members: [] };

	// Each member's lead seat (current term > 2027 run > latest former) +
	// follower counts, all person-keyed.
	const [termRows, runRows, followerRows] = await Promise.all([
		db
			.select({ userId: leaders.userId, status: leaders.status, verifiedAt: leaders.verifiedAt, title: positions.title, region: positions.region })
			.from(leaders)
			.innerJoin(positions, eq(leaders.positionId, positions.id))
			.where(and(inArray(leaders.userId, memberIds), isNull(leaders.deletedAt))),
		db
			.select({ userId: campaigns.subjectUserId, title: positions.title, region: positions.region, verifiedAt: campaigns.verifiedAt })
			.from(campaigns)
			.innerJoin(positions, eq(campaigns.positionId, positions.id))
			.where(
				and(
					inArray(campaigns.subjectUserId, memberIds),
					eq(campaigns.cycleYear, ACTIVE_CYCLE),
					isNull(campaigns.parentCampaignId),
					isNull(campaigns.deletedAt)
				)
			),
		db
			.select({ userId: followers.digestId, n: count() })
			.from(followers)
			.where(and(eq(followers.digest, 'leader'), inArray(followers.digestId, memberIds), isNull(followers.deletedAt)))
			.groupBy(followers.digestId)
	]);
	const followersBy = new Map(followerRows.map((r) => [r.userId, r.n]));
	type Seat = { title: string; region: string; status: string; verified: boolean };
	const seatBy = new Map<number, Seat>();
	for (const t of termRows) {
		const existing = seatBy.get(t.userId);
		if (!existing || (existing.status === 'former' && t.status !== 'former')) {
			seatBy.set(t.userId, { title: t.title, region: t.region, status: t.status, verified: !!t.verifiedAt });
		}
	}
	for (const r of runRows) {
		const held = seatBy.get(r.userId);
		if (!held || held.status === 'former') {
			seatBy.set(r.userId, { title: r.title, region: r.region, status: 'aspirant', verified: !!r.verifiedAt });
		}
	}

	return {
		party: partyData,
		members: memberRows.map((r) => {
			const name = fullName(r.users);
			const seat = seatBy.get(r.users.id);
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
				verified: seat?.verified ?? false,
				status: seat?.status ?? 'aspirant',
				followers: followersBy.get(r.users.id) ?? 0,
				role: r.role,
				positionTitle: seat?.title ?? '',
				region: seat?.region ?? ''
			};
		})
	};
};
