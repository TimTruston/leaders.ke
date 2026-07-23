import { error } from '@sveltejs/kit';
import { and, count, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, followers, leaders, parties, positions, users } from '$lib/server/db/schema';
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
		status: party.status,
		verified: !!party.verifiedAt
	};

	// Members are people with a live term or run recording this party (partyId is
	// per-term/per-run, not a person-level fact — see leaders.partyId).
	const [termRows, runRows] = await Promise.all([
		db
			.select({ users, status: leaders.status, verifiedAt: leaders.verifiedAt, title: positions.title, region: positions.region })
			.from(leaders)
			.innerJoin(positions, eq(leaders.positionId, positions.id))
			.innerJoin(users, eq(leaders.userId, users.id))
			.where(and(eq(leaders.partyId, party.id), isNull(leaders.deletedAt), isNull(users.deletedAt))),
		db
			.select({ users, title: positions.title, region: positions.region, verifiedAt: campaigns.verifiedAt })
			.from(campaigns)
			.innerJoin(positions, eq(campaigns.positionId, positions.id))
			.innerJoin(users, eq(campaigns.subjectUserId, users.id))
			.where(
				and(
					eq(campaigns.partyId, party.id),
					eq(campaigns.cycleYear, ACTIVE_CYCLE),
					isNull(campaigns.parentCampaignId),
					isNotNull(campaigns.verifiedAt),
					isNull(campaigns.deletedAt),
					isNull(users.deletedAt)
				)
			)
	]);

	type Seat = { users: typeof users.$inferSelect; title: string; region: string; status: string; verified: boolean };
	const seatBy = new Map<number, Seat>();
	for (const t of termRows) {
		const existing = seatBy.get(t.users.id);
		if (!existing || (existing.status === 'former' && t.status !== 'former')) {
			seatBy.set(t.users.id, { users: t.users, title: t.title, region: t.region, status: t.status, verified: !!t.verifiedAt });
		}
	}
	for (const r of runRows) {
		const held = seatBy.get(r.users.id);
		if (!held || held.status === 'former') {
			seatBy.set(r.users.id, { users: r.users, title: r.title, region: r.region, status: 'aspirant', verified: !!r.verifiedAt });
		}
	}
	const memberIds = [...seatBy.keys()];
	if (memberIds.length === 0) return { party: partyData, members: [] };

	const followerRows = await db
		.select({ userId: followers.digestId, n: count() })
		.from(followers)
		.where(and(eq(followers.digest, 'leader'), inArray(followers.digestId, memberIds), isNull(followers.deletedAt)))
		.groupBy(followers.digestId);
	const followersBy = new Map(followerRows.map((r) => [r.userId, r.n]));

	return {
		party: partyData,
		members: [...seatBy.values()].map((seat) => {
			const name = fullName(seat.users);
			return {
				name,
				initials: name
					.split(/\s+/)
					.map((w) => w[0])
					.join('')
					.slice(0, 2)
					.toUpperCase(),
				path: leaderPath(seat.users),
				photoUrl: seat.users.photoUrl,
				verified: seat.verified,
				status: seat.status,
				followers: followersBy.get(seat.users.id) ?? 0,
				positionTitle: seat.title,
				region: seat.region
			};
		})
	};
};
