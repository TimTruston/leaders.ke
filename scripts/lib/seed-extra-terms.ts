// Historical leadership terms that don't fit leaders.json's one-row-per-person
// model (a person can only have one entry there, keyed by name). Each row here
// adds a SECOND (or third...) `leaders` row for someone already seeded by the
// 'leaders' phase, so it must run after that phase. Idempotent: skipped if the
// (name, title, region) combination already exists.
import { and, eq, isNull } from 'drizzle-orm';
import { leaders, positions } from '../../src/lib/server/db/schema';
import { findAnyLeaderByName } from './people';
import type { AnyDb } from './names';

type ExtraTerm = {
	name: string;
	title: string;
	region: string;
	status: 'former' | 'current' | 'aspirant';
	startYear: number;
	endYear: number | null;
	note?: string;
};

const EXTRA_TERMS: ExtraTerm[] = [
	{
		name: 'William Ruto',
		title: 'MP',
		region: 'Soy',
		status: 'former',
		startYear: 1997,
		endYear: 2013,
		note: 'Former Eldoret North'
	},
	{
		name: 'Kalonzo Musyoka',
		title: 'MP',
		region: 'Mwingi North',
		status: 'former',
		startYear: 1983,
		endYear: 2007
	}
];

export async function seedExtraTerms(db: AnyDb) {
	let seeded = 0;
	let skipped = 0;

	for (const term of EXTRA_TERMS) {
		const [position] = await db
			.select({ id: positions.id })
			.from(positions)
			.where(and(eq(positions.title, term.title), eq(positions.region, term.region), isNull(positions.deletedAt)));
		if (!position) {
			console.warn(`no ${term.title} position found for region "${term.region}", skipping extra term for ${term.name}`);
			continue;
		}

		const person = await findAnyLeaderByName(db, term.name);
		if (!person) {
			console.warn(`no leader found for "${term.name}" — seed the leaders/mcas phase first, skipping extra term`);
			continue;
		}

		const [existing] = await db
			.select({ id: leaders.id })
			.from(leaders)
			.where(and(eq(leaders.userId, person.userId), eq(leaders.positionId, position.id), isNull(leaders.deletedAt)));
		if (existing) {
			skipped++;
			continue;
		}

		await db.insert(leaders).values({
			userId: person.userId,
			positionId: position.id,
			status: term.status,
			description: term.note,
			from: new Date(`${term.startYear}-01-01T00:00:00+03:00`),
			to: term.endYear ? new Date(`${term.endYear}-01-01T00:00:00+03:00`) : null,
			verifiedAt: new Date()
		});
		seeded++;
	}

	console.log(`[extra-terms] seeded ${seeded}, skipped ${skipped} already-seeded`);
}
