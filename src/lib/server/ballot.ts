// Candidate resolution for /vote/2027 (the ballot simulator). Surfaces every
// 2027 run (campaign) — a real ballot lists candidates, which are runs for
// office, not held terms. ACTIVE_CYCLE (2027) is the cycle this ballot covers.
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, positions, users } from '$lib/server/db/schema';
import { ACTIVE_CYCLE, fullName, leaderPath } from '$lib/server/leader';
import type { County, Constituency, Ward } from '$lib/data/geo';

export type BallotLevel = 'president' | 'governor' | 'senator' | 'womanRep' | 'mp' | 'mca';

export type Candidate = {
	candidateId: string; // "campaign:<id>" — resolved back to live data on the share page
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
	campaigns: typeof campaigns.$inferSelect;
	users: typeof users.$inferSelect;
}): Candidate {
	const name = fullName(row.users);
	return {
		candidateId: `campaign:${row.campaigns.id}`,
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
		verified: !!row.campaigns.verifiedAt
	};
}

/** 2027 runs (campaigns) for one position title + exact region name. */
async function verifiedCampaignsFor(title: string, region: string): Promise<Candidate[]> {
	const rows = await db
		.select({ campaigns, users })
		.from(campaigns)
		.innerJoin(positions, eq(campaigns.positionId, positions.id))
		.innerJoin(users, eq(campaigns.subjectUserId, users.id))
		.where(
			and(
				eq(positions.title, title),
				eq(positions.region, region),
				eq(campaigns.cycleYear, ACTIVE_CYCLE),
				isNull(campaigns.parentCampaignId),
				isNull(campaigns.deletedAt),
				isNull(users.deletedAt)
			)
		);
	return rows.map(toCandidate);
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

	return verifiedCampaignsFor(title, region);
}

/** Re-resolves a stored candidateId ("campaign:<id>") to live display data, or null if gone. */
export async function resolveCandidateById(candidateId: string | null): Promise<Candidate | null> {
	if (!candidateId) return null;

	if (candidateId.startsWith('campaign:')) {
		const id = Number(candidateId.slice('campaign:'.length));
		const [row] = await db
			.select({ campaigns, users })
			.from(campaigns)
			.innerJoin(users, eq(campaigns.subjectUserId, users.id))
			.where(and(eq(campaigns.id, id), isNull(campaigns.deletedAt)));
		return row ? toCandidate(row) : null;
	}

	return null;
}
