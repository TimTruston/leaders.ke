// Seed phase: presidents + governors from scripts/out/scraped-wikipedia-executive.json.
//   - creates the former presidents (person + former President term with real dates)
//   - fills each executive's bio with the Wikipedia intro when the current bio is
//     missing or a short stub (< 200 chars); longer bios are assumed curated and kept
//   - seeds the former presidents' education/professional history (with rewritten
//     descriptions) from src/lib/data/president-experience.json
// Photos ship separately: import-photos.ts (local) downloads them into static/leaders,
// seed-photos.ts assigns the URLs on any DB.
//
//   bun run scripts/seed-executive.ts --apply    (dry-run without the flag)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { experience, leaders, positions, users } from '../src/lib/server/db/schema';
import { user as authUsers } from '../src/lib/server/db/auth.schema';
import { generateLeaderSlug, slugify, splitName } from './lib/names';

type CuratedExperience = { title: string; institution: string; description: string; startAt: string | null; endAt: string | null };
type CuratedPerson = { name: string; bio: string; education: CuratedExperience[]; professional: CuratedExperience[] };

type ExecutiveEntry = {
	name: string;
	seat: 'President' | 'Governor';
	region: string;
	status: 'current' | 'former';
	termStart: string | null;
	termEnd: string | null;
	bio: string | null;
};

const STUB_BIO_CHARS = 200; // anything shorter is a stub worth replacing with the article intro

function toDate(iso: string): Date {
	return new Date(`${iso}T00:00:00+03:00`);
}

const { values: flags } = parseArgs({ options: { apply: { type: 'boolean', default: false } } });

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const client = postgres(process.env.DATABASE_URL, { max: 1 });
const db = drizzle(client);

const entries: ExecutiveEntry[] = JSON.parse(readFileSync(join(import.meta.dir, 'out', 'scraped-wikipedia-executive.json'), 'utf8'));
const curatedExperience = new Map(
	(JSON.parse(readFileSync(join(import.meta.dir, '..', 'src', 'lib', 'data', 'president-experience.json'), 'utf8')) as CuratedPerson[]).map(
		(p) => [p.name, p]
	)
);

let created = 0;
let termsAdded = 0;
let biosApplied = 0;
let biosKept = 0;
let experienceAdded = 0;

for (const entry of entries) {
	// ---- resolve or create the person ----
	let person: { id: number; bio: string | null } | undefined;
	if (entry.status === 'current') {
		// Current executives already exist - resolve via their seat's current holder.
		const [row] = await db
			.select({ id: users.id, bio: users.bio })
			.from(leaders)
			.innerJoin(users, eq(leaders.userId, users.id))
			.innerJoin(positions, eq(leaders.positionId, positions.id))
			.where(
				and(eq(positions.title, entry.seat), eq(positions.region, entry.region), eq(leaders.status, 'current'), isNull(leaders.deletedAt))
			);
		person = row;
	} else {
		// Former presidents: same seed-email idempotency convention as every seeder.
		const email = `${slugify(entry.name)}@seed.leaders.ke`;
		const [existingAuth] = await db.select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.email, email));
		if (existingAuth) {
			const [row] = await db.select({ id: users.id, bio: users.bio }).from(users).where(eq(users.authUserId, existingAuth.id));
			person = row;
		}
		if (!person) {
			created++;
			if (flags.apply) {
				const { firstName, otherNames } = splitName(entry.name);
				const authId = randomUUID();
				await db.insert(authUsers).values({ id: authId, name: entry.name, email, emailVerified: false });
				const slug = await generateLeaderSlug(db, entry.name);
				const [row] = await db
					.insert(users)
					.values({ authUserId: authId, firstName, otherNames, slug })
					.returning({ id: users.id, bio: users.bio });
				person = row;
			}
		}
		// Their former President term (position President/Kenya), one row per presidency.
		if (person && entry.termStart && entry.termEnd) {
			const [position] = await db
				.select({ id: positions.id })
				.from(positions)
				.where(and(eq(positions.title, 'President'), eq(positions.region, entry.region), isNull(positions.deletedAt)));
			if (position) {
				const [existingTerm] = await db
					.select({ id: leaders.id })
					.from(leaders)
					.where(and(eq(leaders.userId, person.id), eq(leaders.positionId, position.id), isNull(leaders.deletedAt)));
				if (!existingTerm) {
					termsAdded++;
					if (flags.apply) {
						await db.insert(leaders).values({
							userId: person.id,
							positionId: position.id,
							status: 'former',
							startAt: toDate(entry.termStart),
							endAt: toDate(entry.termEnd),
							verifiedAt: new Date()
						});
					}
				}
			}
		}
		// Curated education/professional history (with descriptions) on the former term's row.
		const curated = curatedExperience.get(entry.name);
		if (person && curated) {
			const [term] = await db
				.select({ id: leaders.id })
				.from(leaders)
				.innerJoin(positions, eq(leaders.positionId, positions.id))
				.where(and(eq(leaders.userId, person.id), eq(positions.title, 'President'), isNull(leaders.deletedAt)));
			if (term) {
				for (const [expType, rows] of [
					['education', curated.education] as const,
					['professional', curated.professional] as const
				]) {
					for (const expRow of rows) {
						const [existing] = await db
							.select({ id: experience.id, description: experience.description })
							.from(experience)
							.where(
								and(
									eq(experience.leaderId, term.id),
									eq(experience.type, expType),
									eq(experience.title, expRow.title),
									eq(experience.institution, expRow.institution)
								)
							);
						if (existing) {
							if (!existing.description && flags.apply) {
								await db.update(experience).set({ description: expRow.description }).where(eq(experience.id, existing.id));
							}
							continue;
						}
						experienceAdded++;
						if (flags.apply) {
							await db.insert(experience).values({
								leaderId: term.id,
								type: expType,
								title: expRow.title,
								institution: expRow.institution,
								description: expRow.description,
								startAt: expRow.startAt ? toDate(expRow.startAt) : null,
								endAt: expRow.endAt ? toDate(expRow.endAt) : null
							});
						}
					}
				}
			}
		}
	}
	if (!person) continue;

	// ---- bio: hand-rewritten curated bio wins; the Wikipedia intro fills the rest ----
	// The curated bio may replace a bio that is empty, a stub, or the seeder-written
	// wiki intro (exact match) - anything else is treated as later curation and kept.
	const curatedBio = curatedExperience.get(entry.name)?.bio?.trim();
	const current = person.bio?.trim() ?? '';
	if (curatedBio && curatedBio !== current) {
		if (current.length < STUB_BIO_CHARS || current === entry.bio?.trim()) {
			biosApplied++;
			if (flags.apply) await db.update(users).set({ bio: curatedBio }).where(eq(users.id, person.id));
		} else {
			biosKept++;
		}
	} else if (!curatedBio && entry.bio) {
		if (current.length < STUB_BIO_CHARS && entry.bio.trim() !== current) {
			biosApplied++;
			if (flags.apply) await db.update(users).set({ bio: entry.bio.trim() }).where(eq(users.id, person.id));
		} else if (current.length >= STUB_BIO_CHARS) {
			biosKept++;
		}
	}
}

console.log(
	`[seed-executive] ${flags.apply ? 'applied' : 'dry-run'}: ${created} former presidents created, ${termsAdded} terms added, ` +
		`${biosApplied} bios ${flags.apply ? 'written' : 'to write'}, ${biosKept} longer bios kept, ${experienceAdded} experience rows added`
);
await client.end();
