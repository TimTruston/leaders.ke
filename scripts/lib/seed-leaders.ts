// Seeds President/Governor/Senator/Woman Rep/MP candidates (past, incumbent and
// aspiring) from src/lib/data/leaders.json. MCA is handled separately by
// seed-mcas.ts — see that file for why. Logic lives in ./people.ts, shared with
// the mcas phase.
import type { AnyDb } from './names';
import { seedPeople, type PersonRow } from './people';
import leadersData from '../../src/lib/data/leaders.json';

export async function seedLeaders(db: AnyDb) {
	await seedPeople(db, leadersData as PersonRow[], 'leaders');
}
