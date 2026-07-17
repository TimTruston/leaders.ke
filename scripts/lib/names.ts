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

// Named HTML entities the scraped sources actually emit. Numeric forms (&#39; and
// &#x27;) are decoded generically below, so only names live here.
const NAMED_ENTITIES: Record<string, string> = {
	amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
	rsquo: '’', lsquo: '‘', ndash: '–', mdash: '—', hellip: '…'
};

/** Decodes the HTML entities that leak from scraped markup — numeric (`&#39;`,
 * `&#x27;`) and the handful of named ones above — into real characters. The single
 * point every scraper and the dossier builder must run names/bios through, so an
 * apostrophe like Ng'itit never survives as `Ng&#39;itit`. */
export function decodeEntities(input: string): string {
	return input
		.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
		.replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
		.replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

/** decodeEntities for a person's NAME: also folds curly apostrophes to straight so
 * the display form and the slug stay consistent (King'ola, not King’ola). */
export function decodeNameEntities(input: string): string {
	return decodeEntities(input).replace(/[’‘]/g, "'");
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
