// Phase: point users.photoUrl at the git-shipped photo files. Production never
// downloads images — scripts/import-photos.ts (local-only) downloads and
// processes them into static/leaders/<slug>.jpg, which deploys through git; this
// phase just wires the URLs on any DB built by the seeder.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';
import { users } from '../../src/lib/server/db/schema';
import type { AnyDb } from './names';

const PHOTOS_DIR = join(import.meta.dir, '..', '..', 'static', 'leaders');

export async function seedPhotos(db: AnyDb) {
	// Photos are person-scoped (static/leaders/<slug>.jpg, keyed by the person's
	// slug), so match on users directly — an aspirant with only a campaign (no
	// leaders row) has a photo too. The existsSync check means only people with a
	// shipped file get one.
	const rows = await db
		.select({ userId: users.id, slug: users.slug })
		.from(users)
		.where(and(isNull(users.photoUrl), isNull(users.deletedAt)));

	let assigned = 0;
	for (const row of rows) {
		if (!row.slug || !existsSync(join(PHOTOS_DIR, `${row.slug}.jpg`))) continue;
		await db.update(users).set({ photoUrl: `/leaders/${row.slug}.jpg` }).where(eq(users.id, row.userId));
		assigned++;
	}
	console.log(`[photos] assigned ${assigned} photo URLs (${rows.length - assigned} people have no shipped photo)`);
}
