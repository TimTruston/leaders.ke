// Shared loader for the seat civic hub, used by both /[position]/[region] and
// (for single-region national seats like President) /[position] directly.
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, parties, partyMemberships, pillars } from '$lib/server/db/schema';
import {
	ACTIVE_CYCLE,
	findPositionByPath,
	fullName,
	leaderPath,
	listLeadersForSeat,
	slugify
} from '$lib/server/leader';
import { counties, findCountyBySlug, findConstituencyBySlug, findWardBySlug, geoSlug } from '$lib/data/geo';

export async function loadSeatHub(position: string, region: string, regimeYear?: number) {
	const positionRow = await findPositionByPath(position, region);

	if (!positionRow) return null;

	const rows = await listLeadersForSeat(position, region);

	// Which regime this hub shows: the active cycle by default, or a past year
	// (from /[position]/[region]/[year]) — same component, the seat as it stood
	// under that regime. Any mid-term year works (/2026 → the 2022 regime);
	// `regime` normalizes to the covering term's start year below.
	let regime = regimeYear ?? ACTIVE_CYCLE;
	const isActiveRegime = regime === ACTIVE_CYCLE;

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
			photoUrl: r.leaders.photoUrl,
			party,
			partyPath: party ? `/parties/${slugify(party)}` : null,
			status: r.leaders.status,
			verified: !!r.leaders.verifiedAt,
			followers: 0
		};
	};

	// Active regime: today's holder + the 2027 aspirants (an incumbent seeking
	// re-election appears once they hold an aspirant term row for the cycle).
	// Past year: the term COVERING it — most recent start ≤ the year, still
	// running through it — so /2026 shows the 2022 regime's holder. Past regimes
	// list no contestants; the holder card IS that cycle's result.
	let currentRow: (typeof rows)[number] | undefined;
	if (isActiveRegime) {
		currentRow = rows.find((r) => r.leaders.status === 'current');
	} else {
		currentRow = rows
			.filter(
				(r) =>
					r.leaders.status !== 'aspirant' &&
					r.leaders.startAt.getFullYear() <= regime &&
					(!r.leaders.endAt || r.leaders.endAt.getFullYear() >= regime)
			)
			.toSorted((a, b) => b.leaders.startAt.getTime() - a.leaders.startAt.getTime())[0];
		if (currentRow) regime = currentRow.leaders.startAt.getFullYear();
	}
	const dbContestants = isActiveRegime ? rows.filter((r) => r.leaders.status === 'aspirant').map(toCard) : [];

	// Manifesto delivery rollup for the seat's current holder (same shape the
	// public leader profile shows), so the hub can score the incumbent.
	let delivery = { total: 0, delivered: 0, inProgress: 0 };
	if (currentRow) {
		const pillarRows = await db
			.select({ deliveryStatus: pillars.deliveryStatus })
			.from(pillars)
			.innerJoin(campaigns, eq(pillars.campaignId, campaigns.id))
			.where(and(eq(campaigns.leaderId, currentRow.leaders.id), isNull(pillars.deletedAt)));
		delivery = {
			total: pillarRows.length,
			delivered: pillarRows.filter((p) => p.deliveryStatus === 'delivered').length,
			inProgress: pillarRows.filter((p) => p.deliveryStatus === 'in_progress').length
		};
	}

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

	// Regime line options: the active cycle plus each recorded term's start year
	// (deduped — a by-election shares its era's entry), most recent first.
	const seenYears = new Set<number>();
	const regimes = [
		{ year: ACTIVE_CYCLE, label: String(ACTIVE_CYCLE) },
		...history
			.filter((t) => (seenYears.has(t.startYear) ? false : (seenYears.add(t.startYear), true)))
			.map((t) => ({ year: t.startYear, label: `${t.startYear}-${t.endYear ?? 'Now'}` }))
	];

	return {
		positionTitle,
		regionLabel,
		boundary,
		breadcrumb,
		current: currentRow ? toCard(currentRow) : null,
		delivery,
		contestants: dbContestants,
		history,
		cycle: ACTIVE_CYCLE,
		regime,
		regimes,
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
