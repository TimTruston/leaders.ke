import { and, eq, isNull } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/postgres-js';
import { users, DEFAULT_BLOCKED_SLUGS } from '../../src/lib/server/db/schema';

// Accepts either the top-level db handle or a transaction handle (db.transaction's
// callback param) — helpers like getOrCreateParty run inside a per-candidate transaction.
export type AnyDb =
	| ReturnType<typeof drizzle>
	| Parameters<Parameters<ReturnType<typeof drizzle>['transaction']>[0]>[0];

// Local copy of src/lib/server/leader.ts's slugify — that module imports
// $env/dynamic/private (SvelteKit-only) via $lib/server/db, which breaks
// under a plain `bun run` outside the Vite/SvelteKit context. Shared by every
// seed phase that needs to derive a unique seed email from a candidate's name.
export function slugify(input: string): string {
	return input
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '') // strip accents
		.replace(/['’]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');
}

/** Split a full display name into a single-word firstName + the remainder as otherNames. */
export function splitName(fullName: string): { firstName: string; otherNames: string } {
	const [firstName, ...rest] = fullName.trim().split(/\s+/);
	return { firstName, otherNames: rest.join(' ') || firstName };
}

/** Generates a permanent leader slug (lives on `users`, not `leaders` — one person
 * can have several leaders rows sharing this one slug), suffixing "-2", "-3"... on
 * collision. Blocks the same defaults as the app (DEFAULT_BLOCKED_SLUGS from the
 * schema, importable here unlike $lib/server/leader) plus numeric-only slugs. */
export async function generateLeaderSlug(db: AnyDb, name: string): Promise<string> {
	// A numeric-only base can never pass the blocked check (nor can its "-2",
	// "-3"... variants), so prefix it rather than loop forever.
	let base = slugify(name);
	if (!base || /^[0-9-]+$/.test(base)) base = `leader-${base}`.replace(/-$/, '');
	let candidate = base;
	let n = 1;
	// eslint-disable-next-line no-constant-condition
	while (true) {
		if (!DEFAULT_BLOCKED_SLUGS.includes(candidate)) {
			const [existing] = await db
				.select({ id: users.id })
				.from(users)
				.where(and(eq(users.slug, candidate), isNull(users.deletedAt)));
			if (!existing) return candidate;
		}
		n++;
		candidate = `${base}-${n}`;
	}
}
