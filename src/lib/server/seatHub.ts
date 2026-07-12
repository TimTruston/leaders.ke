// Shared loader for the seat civic hub, used by both /[position]/[region] and
// (for single-region national seats like President) /[position] directly.
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { parties, partyMemberships } from '$lib/server/db/schema';
import {
	ACTIVE_CYCLE,
	findPositionByPath,
	fullName,
	leaderPath,
	listLeadersForSeat,
	slugify
} from '$lib/server/leader';
import { counties, findCountyBySlug, findConstituencyBySlug, findWardBySlug, geoSlug } from '$lib/data/geo';

export async function loadSeatHub(position: string, region: string) {
	const positionRow = await findPositionByPath(position, region);

	if (!positionRow) return null;

	const rows = await listLeadersForSeat(position, region);

	const leaderIds = rows.map((r) => r.leaders.id);
	const partyRows = leaderIds.length
		? await db
				.select({ leaderId: partyMemberships.leaderId, partyName: parties.name })
				.from(partyMemberships)
				.innerJoin(parties, eq(partyMemberships.partyId, parties.id))
				.where(and(inArray(partyMemberships.leaderId, leaderIds), isNull(partyMemberships.deletedAt), isNull(partyMemberships.endAt)))
		: [];
	const partyByLeaderId = new Map(partyRows.map((p) => [p.leaderId, p.partyName]));

	const toCard = (r: (typeof rows)[number]) => {
		const name = fullName(r.users);
		const party = partyByLeaderId.get(r.leaders.id) ?? null;
		return {
			name,
			initials: name
				.split(/\s+/)
				.map((w) => w[0])
				.join('')
				.slice(0, 2)
				.toUpperCase(),
			path: leaderPath(r.users),
			party,
			partyPath: party ? `/parties/${slugify(party)}` : null,
			status: r.leaders.status,
			verified: !!r.leaders.verifiedAt,
			followers: 0
		};
	};

	const currentRow = rows.find((r) => r.leaders.status === 'current');
	const dbContestants = rows.filter((r) => r.leaders.status === 'aspirant').map(toCard);

	// History: every recorded term for this seat, most recent first. Aspirants
	// stay off the timeline until elected.
	const history = rows
		.filter((r) => r.leaders.status !== 'aspirant')
		.map((r) => ({
			name: fullName(r.users),
			path: leaderPath(r.users),
			status: r.leaders.status,
			verified: !!r.leaders.verifiedAt,
			startYear: r.leaders.startAt.getFullYear(),
			endYear: r.leaders.endAt?.getFullYear() ?? null
		}))
		.sort((a, b) => b.startYear - a.startYear);

	// IEBC 2022 register data for this seat's geography (county hub gets the
	// full constituency breakdown; MP/MCA seats get their own voter count).
	const county = findCountyBySlug(region);
	const seatVoters = county
		? county.voters
		: (findConstituencyBySlug(region)?.voters ?? findWardBySlug(region)?.voters ?? null);

	const positionTitle = positionRow.title;
	const regionLabel = positionRow.region;
	const boundary = positionRow.boundary;
	const seatPath = `/${position}/${slugify(regionLabel)}`;

	// Breadcrumb: "Position" alone for single-region national seats, "Position /
	// Region" generally, and a 3-level "MCA / Constituency / Ward" for MCA seats.
	let breadcrumb: { label: string; path: string }[];
	if (boundary === 'Country') {
		breadcrumb = [{ label: positionTitle, path: `/${position}` }];
	} else if (positionTitle === 'MCA') {
		const parentConstituency = counties
			.flatMap((c) => c.constituencies)
			.find((c) => c.wards.some((w) => w.seatName === regionLabel));
		const ward = findWardBySlug(region);
		breadcrumb = [
			{ label: positionTitle, path: `/${position}` },
			...(parentConstituency ? [{ label: parentConstituency.name, path: seatPath }] : []),
			{ label: ward?.name ?? regionLabel, path: seatPath }
		];
	} else {
		breadcrumb = [
			{ label: positionTitle, path: `/${position}` },
			{ label: regionLabel, path: seatPath }
		];
	}

	return {
		positionTitle,
		regionLabel,
		boundary,
		breadcrumb,
		current: currentRow ? toCard(currentRow) : null,
		contestants: dbContestants,
		history,
		cycle: ACTIVE_CYCLE,
		basePath: seatPath,
		seatVoters,
		county: county
			? {
					code: county.code,
					name: county.name,
					voters: county.voters,
					constituencies: county.constituencies.map((c) => ({
						code: c.code,
						name: c.name,
						voters: c.voters,
						wardCount: c.wards.length,
						path: `/mp/${geoSlug(c.seatName)}`
					}))
				}
			: null
	};
}

export type SeatHubData = NonNullable<Awaited<ReturnType<typeof loadSeatHub>>>;
