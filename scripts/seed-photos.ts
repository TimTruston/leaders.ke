// Standalone entry point for the photos phase — also runs as part of `bun run
// db:seed` (see scripts/seed.ts, --photos) and scripts/lib/seed-photos.ts for
// the actual logic.
//
//   bun run scripts/seed-photos.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { seedPhotos } from './lib/seed-photos';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const client = postgres(process.env.DATABASE_URL, { max: 1 });
const db = drizzle(client);

await seedPhotos(db);
await client.end();
