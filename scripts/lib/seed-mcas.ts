// Seeds MCA (ward-level) candidates from src/lib/data/mcas.json. Kept as its own
// file + phase, separate from seed-leaders.ts, because MCA spans hundreds of
// wards (a different order of magnitude from the other tiers) and will
// typically only ever have a handful of rows seeded at a time, not all of them.
// Same row shape and logic as seed-leaders.ts (see ./people.ts).
import type { AnyDb } from './names';
import { seedPeople, type PersonRow } from './people';
import mcasData from '../../src/lib/data/mcas.json';

export async function seedMcas(db: AnyDb) {
	const rows = mcasData as PersonRow[];
	if (rows.length === 0) {
		console.log('[mcas] no rows in mcas.json, skipping');
		return;
	}
	await seedPeople(db, rows, 'mcas');
}
