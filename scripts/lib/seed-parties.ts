// Seeds political parties from src/lib/data/parties.json (the ORPP register).
// Mirrors the `parties` table 1:1. Runs before 'leaders'/'mcas' — those phases
// only look up parties by name (never create them), so a party referenced
// there must exist first. Idempotent: skips a name that already exists.
import { eq } from 'drizzle-orm';
import { parties } from '../../src/lib/server/db/schema';
import type { AnyDb } from './names';
import partiesData from '../../src/lib/data/parties.json';

type PartyRow = {
	name: string;
	abbreviation?: string;
	slogan?: string;
	description?: string;
	symbol?: string;
	colors?: string;
	logo?: string;
	postal?: string;
	hq?: string;
	status: 'full' | 'provisional';
	notes?: string;
	certifiedAt?: string; // ISO date string, parsed to a real Date on insert
};

export async function seedParties(db: AnyDb) {
	let seeded = 0;
	let skipped = 0;

	for (const row of partiesData as PartyRow[]) {
		const [existing] = await db.select({ id: parties.id }).from(parties).where(eq(parties.name, row.name));
		if (existing) {
			skipped++;
			continue;
		}
		await db.insert(parties).values({
			...row,
			certifiedAt: row.certifiedAt ? new Date(row.certifiedAt) : null,
			// Curated ORPP register data, already vetted — verified at seed time.
			verifiedAt: new Date()
		});
		seeded++;
	}

	console.log(`[parties] seeded ${seeded}, skipped ${skipped} already-seeded`);
}
