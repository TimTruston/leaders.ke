import { error } from '@sveltejs/kit';
import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, followers, pillars } from '$lib/server/db/schema';
import {
	ACTIVE_CYCLE,
	findPositionByPath,
	fullName,
	campaignPath,
	leaderPath,
	listLeadersForSeat
} from '$lib/server/leader';
import type { PageServerLoad } from './$types';

// /[position]/[region]/[year]: the cycle's comparative candidate grid.
// The active cycle shows aspirants side by side; past cycles show who won
// (the leader whose term started that year) until full ballots are seeded.
export const load: PageServerLoad = async ({ params }) => {
	const year = Number(params.year);
	const position = await findPositionByPath(params.position, params.region);

	if (!position) error(404, 'Seat not found');

	const rows = await listLeadersForSeat(params.position, params.region);

	const isActiveCycle = year === ACTIVE_CYCLE;
	const relevant = isActiveCycle
		? rows.filter((r) => r.leaders.status === 'aspirant')
		: rows.filter((r) => r.leaders.status !== 'aspirant' && r.leaders.startAt.getFullYear() === year);

	const dbCandidates = await Promise.all(
		relevant.map(async (r) => {
			const [[pillarRow], [followerRow]] = await Promise.all([
				db
					.select({ n: count() })
					.from(pillars)
					.innerJoin(campaigns, eq(pillars.campaignId, campaigns.id))
					.where(and(eq(campaigns.leaderId, r.leaders.id), isNull(pillars.deletedAt))),
				db
					.select({ n: count() })
					.from(followers)
					.where(
						and(
							eq(followers.digest, 'leader'),
							eq(followers.digestId, r.leaders.id),
							isNull(followers.deletedAt)
						)
					)
			]);
			const name = fullName(r.users);
			return {
				name,
				initials: name
					.split(/\s+/)
					.map((w) => w[0])
					.join('')
					.slice(0, 2)
					.toUpperCase(),
				photoUrl: r.leaders.photoUrl,
				recordPath: leaderPath(r.users),
				campaignPath: campaignPath(r.users, year),
				party: null as string | null,
				verified: !!r.leaders.verifiedAt,
				pillarCount: pillarRow.n,
				followerCount: followerRow.n
			};
		})
	);

	return {
		positionTitle: position.title,
		regionLabel: position.region,
		basePath: `/${params.position}/${params.region}`,
		year,
		isActiveCycle,
		candidates: dbCandidates
	};
};
