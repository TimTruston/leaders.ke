// Seed phase: the by-elections register (seats vacated mid-term since 2002 and
// their by-election winners) from dossiers.json - terms whose sources include
// 'by-elections' carry the partial-term dates and the vacancy reason as a note.
// Existing people (current MPs, ex-governors, dossier-seeded members) just gain
// the extra term; new people are created seed-email style. The CSV bio (kept
// verbatim in the dossier) fills only empty/stub profiles.
//
//   bun run scripts/seed-by-elections.ts --apply    (dry-run without the flag)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { leaders, positions, users } from '../src/lib/server/db/schema';
import { user as authUsers } from '../src/lib/server/db/auth.schema';
import { generateLeaderSlug, slugify, splitName } from './lib/names';

type DossierTerm = {
	parliament: string;
	seat: string;
	region: string | null;
	sources: string[];
	termStart?: string;
	termEnd?: string;
	note?: string;
};
type DossierEntry = {
	key: string;
	canonicalName: string;
	platformSlug: string | null;
	terms: DossierTerm[];
	bios: { text: string; source: string }[];
};

const STUB_BIO_CHARS = 200;

function toDate(iso: string): Date {
	return new Date(`${iso}T00:00:00+03:00`);
}

function nameTokens(name: string): string[] {
	return name
		.toLowerCase()
		.replace(/[^a-z\s'-]/g, ' ')
		.split(/\s+/)
		// jr/sr normalize and are KEPT: the only difference between a father and son
		.map((t) => (t === 'jr' || t === 'jnr' ? 'junior' : t === 'sr' || t === 'snr' ? 'senior' : t))
		.filter((t) => t.length > 2);
}

function overlap(a: string[], b: string[]): number {
	const set = new Set(b);
	return a.filter((t) => set.has(t)).length;
}

const { values: flags } = parseArgs({ options: { apply: { type: 'boolean', default: false } } });

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const client = postgres(process.env.DATABASE_URL, { max: 1 });
const db = drizzle(client);

const { dossiers } = JSON.parse(readFileSync(join(import.meta.dir, 'out', 'dossiers.json'), 'utf8')) as {
	dossiers: DossierEntry[];
};

type Entry = {
	name: string;
	platformSlug: string | null;
	seat: string;
	region: string;
	termStart: string;
	termEnd: string | null;
	note?: string;
	bio: string | null;
};
const entries: Entry[] = dossiers.flatMap((d) => {
	const byElectionTerms = d.terms.filter((t) => t.sources.includes('by-elections') && t.region && t.termStart);
	if (!byElectionTerms.length) return [];
	const bio = d.bios.find((b) => b.source === 'by-elections')?.text ?? null;
	return byElectionTerms.map((t) => ({
		name: d.canonicalName,
		platformSlug: d.platformSlug,
		seat: t.seat,
		region: t.region!,
		termStart: t.termStart!,
		termEnd: t.termEnd ?? null,
		note: t.note,
		bio
	}));
});
// Oldest term first: insertion order mirrors regime order.
entries.sort((a, b) => a.termStart.localeCompare(b.termStart));

const allUsers = await db
	.select({ id: users.id, firstName: users.firstName, otherNames: users.otherNames, bio: users.bio })
	.from(users);
const userTokens = allUsers.map((u) => ({ u, tokens: nameTokens(`${u.firstName} ${u.otherNames}`) }));

let created = 0;
let termsAdded = 0;
let termsSkipped = 0;
let biosApplied = 0;
let ambiguous = 0;

for (const entry of entries) {
	const [position] = await db
		.select({ id: positions.id })
		.from(positions)
		.where(and(eq(positions.title, entry.seat), eq(positions.region, entry.region), isNull(positions.deletedAt)));
	if (!position) {
		console.warn(`[by-elections] no ${entry.seat} position for "${entry.region}" - skipped ${entry.name}`);
		continue;
	}

	const tokens = nameTokens(entry.name);
	let person: { id: number; bio: string | null } | undefined;

	// 1. The dossier's platform-slug attachment is authoritative when the user exists.
	if (entry.platformSlug) {
		const [bySlug] = await db.select({ id: users.id, bio: users.bio }).from(users).where(eq(users.slug, entry.platformSlug));
		person = bySlug;
	}

	// 2. Seed-email convention (a previous run of this phase created them).
	if (!person) {
		const email = `${slugify(entry.name)}@seed.leaders.ke`;
		const [existingAuth] = await db.select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.email, email));
		if (existingAuth) {
			const [row] = await db.select({ id: users.id, bio: users.bio }).from(users).where(eq(users.authUserId, existingAuth.id));
			person = row;
		}
	}

	// 3. Unique >=2-token subset-guarded match (relatives share tokens: a two-sided
	//    distinctive-token overlap is namesakes, never the same person).
	if (!person) {
		const set = new Set(tokens);
		const candidates = userTokens.filter((c) => {
			if (overlap(tokens, c.tokens) < 2) return false;
			const cSet = new Set(c.tokens);
			return tokens.every((t) => cSet.has(t)) || c.tokens.every((t) => set.has(t));
		});
		if (candidates.length === 1) person = candidates[0].u;
		else if (candidates.length > 1) {
			ambiguous++;
			console.warn(`[by-elections] "${entry.name}" matches ${candidates.length} existing people - created as new; review manually`);
		}
	}

	if (!person) {
		created++;
		if (flags.apply) {
			const { firstName, otherNames } = splitName(entry.name);
			const authId = randomUUID();
			await db
				.insert(authUsers)
				.values({ id: authId, name: entry.name, email: `${slugify(entry.name)}@seed.leaders.ke`, emailVerified: false });
			const slug = await generateLeaderSlug(db, entry.name);
			const [row] = await db
				.insert(users)
				.values({ authUserId: authId, firstName, otherNames, slug })
				.returning({ id: users.id, bio: users.bio });
			person = row;
			userTokens.push({ u: { ...row, firstName, otherNames }, tokens });
		}
	}
	if (!person) continue; // dry-run creation

	const startAt = toDate(entry.termStart);
	const endAt = entry.termEnd ? toDate(entry.termEnd) : null;
	const existingTerms = await db
		.select({ id: leaders.id, startAt: leaders.startAt, endAt: leaders.endAt })
		.from(leaders)
		.where(and(eq(leaders.userId, person.id), eq(leaders.positionId, position.id), isNull(leaders.deletedAt)));
	const overlapping = existingTerms.some(
		(t) => t.startAt.getTime() < (endAt?.getTime() ?? Infinity) && (t.endAt?.getTime() ?? Infinity) > startAt.getTime()
	);
	// An open-ended term makes its holder 'current'; the DB allows one live current
	// per seat, so defer to whoever already holds it.
	let status: 'current' | 'former' = endAt ? 'former' : 'current';
	if (status === 'current') {
		const [existingCurrent] = await db
			.select({ id: leaders.id })
			.from(leaders)
			.where(and(eq(leaders.positionId, position.id), eq(leaders.status, 'current'), isNull(leaders.deletedAt)));
		if (existingCurrent) status = 'former';
	}
	if (overlapping) {
		termsSkipped++;
	} else {
		termsAdded++;
		if (flags.apply) {
			await db.insert(leaders).values({
				userId: person.id,
				positionId: position.id,
				status,
				startAt,
				endAt,
				description: entry.note ?? null,
				verifiedAt: new Date()
			});
		}
	}

	// CSV bio, verbatim: only over nothing or a stub, never over curation.
	if (entry.bio) {
		const current = person.bio?.trim() ?? '';
		if (current.length < STUB_BIO_CHARS && entry.bio.trim() !== current) {
			biosApplied++;
			if (flags.apply) {
				await db.update(users).set({ bio: entry.bio.trim() }).where(eq(users.id, person.id));
				person.bio = entry.bio.trim();
			}
		}
	}
}

console.log(
	`[by-elections] ${flags.apply ? 'applied' : 'dry-run'}: ${created} people created, ${termsAdded} terms added, ` +
		`${termsSkipped} terms already covered, ${biosApplied} bios ${flags.apply ? 'written' : 'to write'}, ${ambiguous} ambiguous names`
);
await client.end();
