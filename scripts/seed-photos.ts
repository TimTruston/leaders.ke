// Seed phase: point users.photoUrl at the git-shipped photo files. Production
// never downloads images — scripts/import-photos.ts (local-only) downloads and
// processes them into static/leaders/<slug>.jpg, which deploys through git; this
// phase just wires the URLs on any DB built by the seeder.
//
//   bun run scripts/seed-photos.ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { leaders, users } from '../src/lib/server/db/schema';

const PHOTOS_DIR = join(import.meta.dir, '..', 'static', 'leaders');

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const client = postgres(process.env.DATABASE_URL, { max: 1 });
const db = drizzle(client);

const rows = await db
	.select({ userId: users.id, slug: users.slug })
	.from(users)
	.innerJoin(leaders, eq(leaders.userId, users.id))
	.where(and(isNull(users.photoUrl), isNull(users.deletedAt), isNull(leaders.deletedAt)))
	.groupBy(users.id, users.slug);

let assigned = 0;
for (const row of rows) {
	if (!row.slug || !existsSync(join(PHOTOS_DIR, `${row.slug}.jpg`))) continue;
	await db.update(users).set({ photoUrl: `/leaders/${row.slug}.jpg` }).where(eq(users.id, row.userId));
	assigned++;
}
console.log(`[seed-photos] assigned ${assigned} photo URLs (${rows.length - assigned} leaders have no shipped photo)`);
await client.end();
