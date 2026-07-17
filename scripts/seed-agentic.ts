// Seed phase: applies scripts/out/agentic-output.json (the agent-written layer on
// top of dossiers.json) to the DB:
//   - rewritten bios — only onto a bio that is NULL or that exactly matches one of
//     the person's scraped source bios (i.e. text the seeder itself wrote earlier);
//     anything else may be manager-authored and is never touched
//   - education/professional experience rows on the person's most recent leaders row
//   - normalization of existing SOURCED contact values in place (0722... -> 254722...)
// People are matched by slug (agentic entries are keyed by platform slug), so this
// works on any freshly seeded DB regardless of row ids. Idempotent.
//
//   bun run scripts/seed-agentic.ts --apply    (dry-run without the flag)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { and, desc, eq, isNull, isNotNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { contacts, experience, leaders, positions, users } from '../src/lib/server/db/schema';
import { modeledSeatOffice } from './lib/offices';

const OUT_DIR = join(import.meta.dir, 'out');

type ExperienceRow = { title: string; institution: string; startAt: string | null; endAt: string | null };
type Entry = {
	key: string;
	platformSlug: string | null;
	bio: string | null;
	education: ExperienceRow[];
	professional: ExperienceRow[];
	flaggedMismerge?: boolean;
};

function toDate(iso: string | null): Date | null {
	return iso ? new Date(`${iso}T00:00:00+03:00`) : null;
}

function normalizePhone(raw: string): string {
	const digits = raw.replace(/[^0-9]/g, '');
	if (digits.startsWith('254')) return digits;
	if (digits.startsWith('0')) return `254${digits.slice(1)}`;
	if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
	return digits || raw;
}

const { values: flags } = parseArgs({ options: { apply: { type: 'boolean', default: false } } });

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const client = postgres(process.env.DATABASE_URL, { max: 1 });
const db = drizzle(client);

const entries: Entry[] = JSON.parse(readFileSync(join(OUT_DIR, 'agentic-output.json'), 'utf8'));
// Scraped source-bio texts per key — the "did the seeder write this bio?" test.
const dossierBios = new Map<string, Set<string>>(
	(JSON.parse(readFileSync(join(OUT_DIR, 'dossiers.json'), 'utf8')).dossiers as { key: string; bios: { text: string }[] }[]).map(
		(d) => [d.key, new Set(d.bios.map((b) => b.text.replace(/\s+/g, ' ').trim()))]
	)
);

let biosApplied = 0;
let biosProtected = 0;
let experienceAdded = 0;
let phonesNormalized = 0;
let unmatched = 0;

for (const entry of entries) {
	if (entry.flaggedMismerge) continue;
	const slug = entry.platformSlug ?? entry.key;
	const [person] = await db.select({ id: users.id, bio: users.bio }).from(users).where(and(eq(users.slug, slug), isNull(users.deletedAt)));
	if (!person) {
		unmatched++;
		continue;
	}

	if (entry.bio) {
		const current = person.bio?.replace(/\s+/g, ' ').trim();
		const seederWroteIt = !current || dossierBios.get(entry.key)?.has(current) || current === entry.bio.replace(/\s+/g, ' ').trim();
		if (seederWroteIt) {
			if (current !== entry.bio.replace(/\s+/g, ' ').trim()) {
				if (flags.apply) await db.update(users).set({ bio: entry.bio }).where(eq(users.id, person.id));
				biosApplied++;
			}
		} else {
			biosProtected++; // likely manager-authored — never overwritten
		}
	}

	// Elective seats we model as positions become Track Record `leaders` terms.
	// A professional-experience row for a seat the person actually holds as a term
	// would list that office twice (once linked as Track Record, once unlinked), so
	// drop it — but ONLY when the matching term exists, so a nominated stint or an
	// un-modeled office (its sole record) is never lost.
	const heldOffices = new Set(
		(
			await db
				.select({ title: positions.title })
				.from(leaders)
				.innerJoin(positions, eq(leaders.positionId, positions.id))
				.where(and(eq(leaders.userId, person.id), isNull(leaders.deletedAt)))
		).map((r) => r.title)
	);
	const rows = [
		...entry.education.map((r) => ({ ...r, kind: 'education' as const })),
		...entry.professional
			.filter((r) => {
				const office = modeledSeatOffice(r.title, r.institution);
				return !(office && heldOffices.has(office));
			})
			.map((r) => ({ ...r, kind: 'professional' as const }))
	].filter((r) => r.title);
	if (rows.length) {
		// Experience hangs off the person's most recent leaders row.
		const [leader] = await db
			.select({ id: leaders.id })
			.from(leaders)
			.where(and(eq(leaders.userId, person.id), isNull(leaders.deletedAt)))
			.orderBy(desc(leaders.startAt))
			.limit(1);
		if (leader) {
			for (const row of rows) {
				const [existing] = await db
					.select({ id: experience.id })
					.from(experience)
					.where(
						and(
							eq(experience.leaderId, leader.id),
							eq(experience.type, row.kind),
							eq(experience.title, row.title),
							eq(experience.institution, row.institution)
						)
					);
				if (existing) continue;
				if (flags.apply) {
					await db.insert(experience).values({
						leaderId: leader.id,
						type: row.kind,
						title: row.title,
						institution: row.institution,
						startAt: toDate(row.startAt),
						endAt: toDate(row.endAt)
					});
				}
				experienceAdded++;
			}
		}
	}

	// Normalize sourced phone values in place (never a value someone typed themselves).
	const phoneRows = await db
		.select({ id: contacts.id, value: contacts.value })
		.from(contacts)
		.where(and(eq(contacts.userId, person.id), eq(contacts.channel, 'sms'), isNotNull(contacts.source), isNull(contacts.deletedAt)));
	for (const p of phoneRows) {
		const normalized = normalizePhone(p.value);
		if (normalized === p.value) continue;
		// The normalized value may already be live on another row (unique index) — leave it then.
		const [holder] = await db
			.select({ id: contacts.id })
			.from(contacts)
			.where(and(eq(contacts.channel, 'sms'), eq(contacts.value, normalized), isNull(contacts.deletedAt)));
		if (holder) continue;
		if (flags.apply) await db.update(contacts).set({ value: normalized }).where(eq(contacts.id, p.id));
		phonesNormalized++;
	}
}

console.log(
	`[seed-agentic] ${flags.apply ? 'applied' : 'dry-run'}: ${biosApplied} bios ${flags.apply ? 'written' : 'to write'}, ` +
		`${biosProtected} protected (not seeder-written), ${experienceAdded} experience rows, ` +
		`${phonesNormalized} phones normalized, ${unmatched} entries with no matching slug`
);
await client.end();
