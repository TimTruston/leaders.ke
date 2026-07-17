// Seed phase: past county governors (2013-2017 and 2017-2022 cycles, including
// mid-term successors) from scripts/out/scraped-wikipedia-governors-past.json.
// Enriches repeat leaders rather than duplicating them: a re-elected current
// governor just gains a former term row; a brand-new person is created with the
// seed-email convention. Bios fill only when the profile has none or a stub.
//
//   bun run scripts/seed-former-governors.ts --apply    (dry-run without the flag)
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

type PastGovernor = {
	name: string;
	county: string;
	cycle: '2013' | '2017';
	termStart: string;
	termEnd: string;
	note?: string;
	bio: string | null;
};

const STUB_BIO_CHARS = 200;

function toDate(iso: string): Date {
	return new Date(`${iso}T00:00:00+03:00`);
}

function nameTokens(name: string): string[] {
	return name.toLowerCase().replace(/[^a-z\s'-]/g, ' ').split(/\s+/).filter((t) => t.length > 2);
}

function overlap(a: string[], b: string[]): number {
	const set = new Set(b);
	return a.filter((t) => set.has(t)).length;
}

const { values: flags } = parseArgs({ options: { apply: { type: 'boolean', default: false } } });

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const client = postgres(process.env.DATABASE_URL, { max: 1 });
const db = drizzle(client);

const entries: PastGovernor[] = JSON.parse(
	readFileSync(join(import.meta.dir, 'out', 'scraped-wikipedia-governors-past.json'), 'utf8')
);

// All users once, for name matching (spellings differ across sources:
// "Wilber Ottichilo" vs "Wilber Khasilwa Otichillo").
const allUsers = await db
	.select({ id: users.id, firstName: users.firstName, otherNames: users.otherNames, bio: users.bio })
	.from(users);
const userTokens = allUsers.map((u) => ({ u, tokens: nameTokens(`${u.firstName} ${u.otherNames}`) }));

let created = 0;
let termsAdded = 0;
let termsSkipped = 0;
let biosApplied = 0;
let ambiguous = 0;

// Table spellings that would mismatch or ambiguously match our existing people.
const NAME_CANON: Record<string, string> = {
	'Ibrahim Roba Ali': 'Ali Roba' // 2013 table order; matches the sitting senator's dossier person
};

for (const entry of entries) {
	entry.name = NAME_CANON[entry.name] ?? entry.name;
	const [position] = await db
		.select({ id: positions.id })
		.from(positions)
		.where(and(eq(positions.title, 'Governor'), eq(positions.region, entry.county), isNull(positions.deletedAt)));
	if (!position) {
		console.warn(`[former-governors] no Governor position for "${entry.county}" - skipped ${entry.name}`);
		continue;
	}

	// ---- resolve the person: seat-holder name match, seed email, unique token match, else create ----
	const tokens = nameTokens(entry.name);
	let person: { id: number; bio: string | null } | undefined;

	// 0. Known re-elected governors whose scraped spelling shares <2 tokens with the
	//    DB name ("Mohamud Ali" / "Mohamed Muhammad Ali"): bind to the seat's current holder.
	const ALIAS_TO_CURRENT = new Set(['Mohamud Ali|Marsabit', 'Wilber Ottichilo|Vihiga']);
	if (ALIAS_TO_CURRENT.has(`${entry.name}|${entry.county}`)) {
		const [holder] = await db
			.select({ id: users.id, bio: users.bio })
			.from(leaders)
			.innerJoin(users, eq(leaders.userId, users.id))
			.where(and(eq(leaders.positionId, position.id), eq(leaders.status, 'current'), isNull(leaders.deletedAt)));
		person = holder;
	}

	// 1. Anyone already holding a term on this exact seat sharing >=2 name tokens is
	//    the same person (re-elected governors; one shared token like "Ahmed" would
	//    merge strangers in counties where names repeat heavily).
	if (!person) {
		const seatHolders = await db
			.select({ id: users.id, firstName: users.firstName, otherNames: users.otherNames, bio: users.bio })
			.from(leaders)
			.innerJoin(users, eq(leaders.userId, users.id))
			.where(and(eq(leaders.positionId, position.id), isNull(leaders.deletedAt)));
		person = seatHolders.find((h) => overlap(tokens, nameTokens(`${h.firstName} ${h.otherNames}`)) >= 2);
	}

	// 2. Seed-email convention (a previous run of this phase created them).
	if (!person) {
		const email = `${slugify(entry.name)}@seed.leaders.ke`;
		const [existingAuth] = await db.select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.email, email));
		if (existingAuth) {
			const [row] = await db
				.select({ id: users.id, bio: users.bio })
				.from(users)
				.where(eq(users.authUserId, existingAuth.id));
			person = row;
		}
	}

	// 3. Unique >=2-token match anywhere (ex-MPs, senators, dossier-seeded people).
	//    Subset guard, same as dossier clustering: a 2-token overlap is only the same
	//    person when one name's tokens are a subset of the other's - distinctive
	//    tokens on both sides means namesakes ("Hassan Ali JOHO" vs "Ali Hassan ABDIRAHMAN").
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
			console.warn(
				`[former-governors] "${entry.name}" matches ${candidates.length} existing people - created as new; review manually`
			);
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

	// ---- former term row, unless one already covers this range ----
	const startAt = toDate(entry.termStart);
	const endAt = toDate(entry.termEnd);
	const existingTerms = await db
		.select({ id: leaders.id, startAt: leaders.startAt, endAt: leaders.endAt })
		.from(leaders)
		.where(and(eq(leaders.userId, person.id), eq(leaders.positionId, position.id), isNull(leaders.deletedAt)));
	const overlapping = existingTerms.some(
		(t) => t.startAt.getTime() < endAt.getTime() && (t.endAt?.getTime() ?? Infinity) > startAt.getTime()
	);
	if (overlapping) {
		termsSkipped++;
	} else {
		termsAdded++;
		if (flags.apply) {
			await db.insert(leaders).values({
				userId: person.id,
				positionId: position.id,
				status: 'former',
				startAt,
				endAt,
				description: entry.note ?? null,
				verifiedAt: new Date()
			});
		}
	}

	// ---- bio: Wikipedia intro over nothing or a stub, never over curation ----
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
	`[former-governors] ${flags.apply ? 'applied' : 'dry-run'}: ${created} people created, ${termsAdded} terms added, ` +
		`${termsSkipped} terms already covered, ${biosApplied} bios ${flags.apply ? 'written' : 'to write'}, ${ambiguous} ambiguous names`
);
await client.end();
