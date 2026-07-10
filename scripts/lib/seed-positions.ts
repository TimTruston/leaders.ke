// Seeds the full 2027 positions register from the IEBC 2022 ward register
// (src/lib/data/regions.json via the geo module): national seats, plus Governor/
// Senator/Woman Rep per county, MP per constituency and MCA per ward.
// Idempotent: only inserts (title, region) pairs that don't exist yet.
import { positions } from '../../src/lib/server/db/schema';
import { counties } from '../../src/lib/data/geo';
import type { AnyDb } from './names';

type SeedPosition = typeof positions.$inferInsert;

export async function seedPositions(db: AnyDb) {
	const rows: SeedPosition[] = [
		{ region: 'Kenya', boundary: 'Country', title: 'President', band: 'national' },
		...counties.flatMap((county): SeedPosition[] => [
			{ region: county.name, boundary: 'County', title: 'Governor', band: 'regional' },
			{ region: county.name, boundary: 'County', title: 'Senator', band: 'regional' },
			{ region: county.name, boundary: 'County', title: 'Woman Rep', band: 'regional' },
			// seatName is unique nationwide (duplicated names carry a qualifier),
			// so region alone keeps /mp/... and /mca/... URLs unambiguous.
			...county.constituencies.flatMap((constituency): SeedPosition[] => [
				{ region: constituency.seatName, boundary: 'Constituency', title: 'MP', band: 'regional' },
				...constituency.wards.map(
					(ward): SeedPosition => ({
						region: ward.seatName,
						boundary: 'Ward',
						title: 'MCA',
						band: 'ward'
					})
				)
			])
		])
	];

	const existingRows = await db.select({ region: positions.region, title: positions.title }).from(positions);
	const existingKeys = new Set(existingRows.map((p) => `${p.title}|${p.region}`));
	const missing = rows.filter((r) => !existingKeys.has(`${r.title}|${r.region}`));

	if (missing.length === 0) {
		console.log(`[positions] register complete (${existingRows.length} rows), skipping`);
	} else {
		// Chunked inserts keep each statement well under parameter limits.
		for (let i = 0; i < missing.length; i += 500) {
			await db.insert(positions).values(missing.slice(i, i + 500));
		}
		console.log(`[positions] seeded ${missing.length} (register now ${existingRows.length + missing.length})`);
	}
}
