// Seeds civic issues from src/lib/data/issues.json. Mirrors the `issues` table
// (positionId-scoped, not leader-scoped — an issue belongs to a seat, e.g.
// "MCA of Westlands", regardless of who holds it). Stub file — empty until real
// issue content is supplied; add rows shaped like IssueRow below and re-run
// `bun run db:seed -- --issues`. creatorId is a shared system seed account since
// issues aren't naturally authored by a specific leader.
import { and, eq, isNull } from 'drizzle-orm';
import { issues, positions } from '../../src/lib/server/db/schema';
import { getOrCreateSystemUser } from './people';
import type { AnyDb } from './names';
import issuesData from '../../src/lib/data/issues.json';

type IssueRow = {
	positionTitle: string;
	region: string;
	title: string;
	description: string;
};

export async function seedIssues(db: AnyDb) {
	const rows = issuesData as IssueRow[];
	if (rows.length === 0) {
		console.log('[issues] no rows in issues.json, skipping');
		return;
	}

	const creatorId = await getOrCreateSystemUser(db, 'Civic Desk');

	let seeded = 0;
	let skipped = 0;
	let missingPosition = 0;

	for (const row of rows) {
		const [position] = await db
			.select({ id: positions.id })
			.from(positions)
			.where(and(eq(positions.title, row.positionTitle), eq(positions.region, row.region), isNull(positions.deletedAt)));
		if (!position) {
			console.warn(`no ${row.positionTitle} position found for region "${row.region}", skipping issue "${row.title}"`);
			missingPosition++;
			continue;
		}

		const [existing] = await db
			.select({ id: issues.id })
			.from(issues)
			.where(and(eq(issues.positionId, position.id), eq(issues.title, row.title), isNull(issues.deletedAt)));
		if (existing) {
			skipped++;
			continue;
		}

		await db.insert(issues).values({ creatorId, positionId: position.id, title: row.title, description: row.description });
		seeded++;
	}

	console.log(`[issues] seeded ${seeded}, skipped ${skipped} already-seeded, ${missingPosition} missing a position`);
}
