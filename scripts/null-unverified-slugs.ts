// One-off maintenance: null the public slug on every UNVERIFIED profile, aligning
// old data with the current rule that an application is slugless until an admin
// approves it (the slug is minted on approval — see reviewVerification; previews
// use /previews/[userId]). "Unverified" = no verified leaders term AND no verified
// campaign. The seeded admin-fixture demo (`example-leader`) is skipped: it's a
// deliberate dev-only exception that must stay reachable at its /[slug].
//
//   bun run scripts/null-unverified-slugs.ts            # dry run (lists affected)
//   bun run scripts/null-unverified-slugs.ts --apply    # actually null them
import { parseArgs } from 'node:util';
import { and, eq, isNotNull, isNull, ne, notExists } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { campaigns, leaders, users } from '../src/lib/server/db/schema';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const client = postgres(process.env.DATABASE_URL, { max: 1 });
const db = drizzle(client);

const { values } = parseArgs({ options: { apply: { type: 'boolean', default: false } } });

// A person is unverified when neither a verified leaders term nor a verified run exists.
const hasVerifiedTerm = db
	.select({ one: leaders.id })
	.from(leaders)
	.where(and(eq(leaders.userId, users.id), isNotNull(leaders.verifiedAt), isNull(leaders.deletedAt)));
const hasVerifiedRun = db
	.select({ one: campaigns.id })
	.from(campaigns)
	.where(and(eq(campaigns.subjectUserId, users.id), isNotNull(campaigns.verifiedAt), isNull(campaigns.deletedAt)));

const targets = await db
	.select({ id: users.id, slug: users.slug })
	.from(users)
	.where(
		and(
			isNotNull(users.slug),
			ne(users.slug, 'example-leader'),
			isNull(users.deletedAt),
			notExists(hasVerifiedTerm),
			notExists(hasVerifiedRun)
		)
	);

console.log(`${targets.length} unverified profile(s) still hold a slug:`);
for (const t of targets) console.log(`  /${t.slug} (user ${t.id})`);

if (!values.apply) {
	console.log('\nDry run — pass --apply to null these slugs.');
} else if (targets.length > 0) {
	for (const t of targets) {
		await db.update(users).set({ slug: null }).where(eq(users.id, t.id));
	}
	console.log(`\nNulled ${targets.length} slug(s).`);
}

await client.end();
