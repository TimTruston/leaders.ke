// Candidate resolution for /vote/2027 (the ballot simulator). Only surfaces
// verified DB candidates — this simulates a real ballot, not a claims directory.
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { leaders, positions, users } from '$lib/server/db/schema';
import { fullName, leaderPath } from '$lib/server/leader';
import type { County, Constituency, Ward } from '$lib/data/geo';

export type BallotLevel = 'president' | 'governor' | 'senator' | 'womanRep' | 'mp' | 'mca';

export type Candidate = {
	candidateId: string; // "db:<leaderId>" — resolved back to live data on the share page
	name: string;
	initials: string;
	photoUrl: string | null;
	party: string | null;
	path: string;
	verified: boolean;
};

const LEVEL_TITLE: Record<BallotLevel, string> = {
	president: 'President',
	governor: 'Governor',
	senator: 'Senator',
	womanRep: 'Woman Rep',
	mp: 'MP',
	mca: 'MCA'
};

export const BALLOT_LEVELS: BallotLevel[] = ['president', 'governor', 'senator', 'womanRep', 'mp', 'mca'];

function toCandidate(row: {
	leaders: typeof leaders.$inferSelect;
	positions: typeof positions.$inferSelect;
	users: typeof users.$inferSelect;
}): Candidate {
	const name = fullName(row.users);
	return {
		candidateId: `db:${row.leaders.id}`,
		name,
		initials: name
			.split(/\s+/)
			.map((w) => w[0])
			.join('')
			.slice(0, 2)
			.toUpperCase(),
		photoUrl: row.users.photoUrl,
		party: null,
		path: leaderPath(row.users),
		verified: !!row.leaders.verifiedAt
	};
}

/** Verified DB leaders for one position title + exact region name. */
async function verifiedLeadersFor(title: string, region: string): Promise<Candidate[]> {
	const rows = await db
		.select()
		.from(leaders)
		.innerJoin(positions, eq(leaders.positionId, positions.id))
		.innerJoin(users, eq(leaders.userId, users.id))
		.where(and(eq(positions.title, title), eq(positions.region, region), isNull(leaders.deletedAt)));
	return rows.filter((r) => r.leaders.verifiedAt).map(toCandidate);
}

/**
 * Candidates for one ballot level given the citizen's selected geography.
 * Returns [] when nothing exists yet (no fabricated candidates) — the UI must let the
 * citizen explicitly skip a level rather than block on it.
 */
export async function resolveCandidates(
	level: BallotLevel,
	geo: { county: County; constituency: Constituency; ward: Ward }
): Promise<Candidate[]> {
	const title = LEVEL_TITLE[level];
	let region: string;

	switch (level) {
		case 'president':
			region = 'Kenya';
			break;
		case 'governor':
		case 'senator':
		case 'womanRep':
			region = geo.county.name;
			break;
		case 'mp':
			region = geo.constituency.seatName;
			break;
		case 'mca':
			region = geo.ward.seatName;
			break;
	}

	return verifiedLeadersFor(title, region);
}

/** Re-resolves a stored candidateId ("db:<id>") to live display data, or null if gone. */
export async function resolveCandidateById(candidateId: string | null): Promise<Candidate | null> {
	if (!candidateId) return null;

	if (candidateId.startsWith('db:')) {
		const id = Number(candidateId.slice('db:'.length));
		const [row] = await db
			.select()
			.from(leaders)
			.innerJoin(positions, eq(leaders.positionId, positions.id))
			.innerJoin(users, eq(leaders.userId, users.id))
			.where(and(eq(leaders.id, id), isNull(leaders.deletedAt)));
		return row ? toCandidate(row) : null;
	}

	return null;
}
