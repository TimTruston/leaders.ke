// The per-position leader directory rendered on /[position] (the old /leaders
// grid, folded into the seat taxonomy). Batched like the /rank pages: 3 queries
// per request no matter how many leaders the position has, filters applied
// server-side, and only the requested page's cards ship.
import { and, count, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, followers, leaders, parties, partyMemberships, positions, users } from '$lib/server/db/schema';
import { fullName, leaderPath, slugify } from '$lib/server/leader';
import { counties } from '$lib/data/geo';

export type DirectoryFilters = {
	page: number;
	pageSize: number;
	/** Region label; for MCA this is a constituency seat name (wards roll up). */
	region: string;
	party: string;
	status: '' | 'current' | 'aspirant';
	query: string;
	/** Regime year: reslice the directory to who held the position that year
	 * (term covering it); null = today's view (currents + aspirants preferred). */
	regime: number | null;
};

export type DirectoryCard = {
	path: string;
	name: string;
	initials: string;
	photoUrl: string | null;
	party: string | null;
	partyPath: string | null;
	countyLabel: string;
	positionTitle: string;
	status: string;
	verified: boolean;
	followers: number;
};

// MCA leaders are listed by ward; the directory filter picks a constituency, so
// map each ward seat name back to its parent constituency once at module load.
const CONSTITUENCY_BY_WARD = new Map(
	counties.flatMap((c) => c.constituencies).flatMap((con) => con.wards.map((w) => [w.seatName, con.seatName]))
);

const STATUS_ORDER: Record<string, number> = { current: 0, aspirant: 1, former: 2 };

/**
 * One position's verified leaders as directory cards, filtered and paginated.
 * Also returns the filter options (regions/parties present in the full set) so
 * the UI's dropdowns always reflect what exists, not what the page shows.
 */
export async function listPositionDirectory(positionTitle: string, f: DirectoryFilters) {
	type Row = {
		leaderId: number | null;
		userId: number;
		slug: string | null;
		firstName: string;
		otherNames: string;
		photoUrl: string | null;
		status: string;
		region: string;
		startAt: Date;
		endAt: Date | null;
	};

	// Held terms (current/former) at this position.
	const leaderRows: Row[] = await db
		.select({
			leaderId: leaders.id,
			userId: users.id,
			slug: users.slug,
			firstName: users.firstName,
			otherNames: users.otherNames,
			photoUrl: users.photoUrl,
			status: leaders.status,
			region: positions.region,
			startAt: leaders.startAt,
			endAt: leaders.endAt
		})
		.from(leaders)
		.innerJoin(positions, eq(leaders.positionId, positions.id))
		.innerJoin(users, eq(leaders.userId, users.id))
		.where(and(isNull(leaders.deletedAt), isNotNull(leaders.verifiedAt), eq(positions.title, positionTitle)));

	// Verified 2027 runs (campaigns) at this position — the aspirants (no leaders row).
	const runRows = await db
		.select({
			userId: users.id,
			slug: users.slug,
			firstName: users.firstName,
			otherNames: users.otherNames,
			photoUrl: users.photoUrl,
			region: positions.region,
			cycleYear: campaigns.cycleYear
		})
		.from(campaigns)
		.innerJoin(positions, eq(campaigns.positionId, positions.id))
		.innerJoin(users, eq(campaigns.subjectUserId, users.id))
		.where(
			and(
				eq(positions.title, positionTitle),
				isNull(campaigns.parentCampaignId),
				isNotNull(campaigns.verifiedAt),
				isNull(campaigns.deletedAt)
			)
		);
	const rows: Row[] = [
		...leaderRows,
		...runRows.map((r) => ({
			leaderId: null,
			userId: r.userId,
			slug: r.slug,
			firstName: r.firstName,
			otherNames: r.otherNames,
			photoUrl: r.photoUrl,
			status: 'aspirant',
			region: r.region,
			startAt: new Date(r.cycleYear, 7, 10), // election day of the cycle, for ordering only
			endAt: null
		}))
	];

	// Regime options: every year a recorded (non-aspirant) term started, newest first.
	const regimeOptions = [
		...new Set(rows.filter((r) => r.status !== 'aspirant').map((r) => r.startAt.getFullYear()))
	].sort((a, b) => b - a);

	// One card per person. Today's view prefers the non-'former' row (else the
	// most recent term); a regime year reslices to the terms COVERING that year,
	// each person wearing that era's seat.
	const eligible = f.regime
		? rows.filter(
				(r) =>
					r.status !== 'aspirant' &&
					r.startAt.getFullYear() <= f.regime! &&
					(!r.endAt || r.endAt.getFullYear() >= f.regime!)
			)
		: rows;
	const bySlug = new Map<string, (typeof rows)[number]>();
	for (const r of eligible) {
		if (!r.slug) continue;
		const existing = bySlug.get(r.slug);
		const better = f.regime
			? !existing || r.startAt.getTime() > existing.startAt.getTime()
			: !existing ||
				(existing.status === 'former' &&
					(r.status !== 'former' || (r.endAt?.getTime() ?? 0) > (existing.endAt?.getTime() ?? 0)));
		if (better) bySlug.set(r.slug, r);
	}
	const people = [...bySlug.values()];
	if (people.length === 0) {
		return { total: 0, leaders: [] as DirectoryCard[], regionOptions: [] as string[], partyOptions: [] as string[], regimeOptions };
	}
	const personIds = people.map((p) => p.userId);

	// Follower counts + live party, both per PERSON (follows and party are person-scoped).
	const [followerRows, partyRows] = await Promise.all([
		db
			.select({ userId: followers.digestId, n: count() })
			.from(followers)
			.where(and(eq(followers.digest, 'leader'), inArray(followers.digestId, personIds), isNull(followers.deletedAt)))
			.groupBy(followers.digestId),
		db
			.select({ userId: partyMemberships.subjectUserId, partyName: parties.name })
			.from(partyMemberships)
			.innerJoin(parties, eq(partyMemberships.partyId, parties.id))
			.where(and(inArray(partyMemberships.subjectUserId, personIds), isNull(partyMemberships.deletedAt), isNull(partyMemberships.endAt)))
	]);
	const followersBy = new Map(followerRows.map((r) => [r.userId, r.n]));
	const partyBy = new Map(partyRows.map((r) => [r.userId, r.partyName]));

	// Filter options come from the FULL position set (before filtering). Raw region
	// labels — for MCA these are ward seat names; SearchFilter derives the
	// constituency dropdown from them itself.
	const isMca = positionTitle === 'MCA';
	const regionOptions = [...new Set(people.map((p) => p.region))].sort();
	const partyOptions = [...new Set(partyRows.map((r) => r.partyName))].sort();

	const q = f.query.trim().toLowerCase();
	const filtered = people.filter((p) => {
		if (f.region && (isMca ? CONSTITUENCY_BY_WARD.get(p.region) !== f.region : p.region !== f.region)) return false;
		if (f.party && partyBy.get(p.userId) !== f.party) return false;
		if (f.status && p.status !== f.status) return false;
		if (q && !fullName(p).toLowerCase().includes(q)) return false;
		return true;
	});

	// Directory order (same as the old /leaders): status, then reach, then name.
	const sorted = filtered
		.map((p) => ({ ...p, followerCount: followersBy.get(p.userId) ?? 0 }))
		.sort(
			(a, b) =>
				(STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3) ||
				(a.status === 'former' ? (b.endAt?.getTime() ?? 0) - (a.endAt?.getTime() ?? 0) : 0) ||
				b.followerCount - a.followerCount ||
				fullName(a).localeCompare(fullName(b))
		);

	const cards = sorted.slice((f.page - 1) * f.pageSize, f.page * f.pageSize).map((p) => {
		const name = fullName(p);
		const party = partyBy.get(p.userId) ?? null;
		return {
			path: leaderPath(p),
			name,
			initials: name
				.split(/\s+/)
				.map((w) => w[0])
				.join('')
				.slice(0, 2)
				.toUpperCase(),
			photoUrl: p.photoUrl,
			party,
			partyPath: party ? `/parties/${slugify(party)}` : null,
			countyLabel: p.region,
			positionTitle,
			status: p.status,
			verified: true,
			followers: p.followerCount
		} satisfies DirectoryCard;
	});

	return { total: sorted.length, leaders: cards, regionOptions, partyOptions, regimeOptions };
}
