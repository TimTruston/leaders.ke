// Seeds the 12th and 11th National Assemblies from scripts/out/scraped-mps-{12th,11th}.json
// as FORMER terms with each parliament's real dates. Repeat people (re-elected members,
// current senators/governors who were MPs) are matched and enriched — never duplicated,
// and never overwritten: every parliament keeps its own leaders row, so a member of both
// the 11th and 12th ends up with two former rows plus whatever current row they hold.
//
// Person matching, strongest first:
//   1. mzalendo slug: the same person page slug appearing in the 13th-parliament file
//      resolves to that seat's current holder in the DB.
//   2. seed email: slugify(name)@seed.leaders.ke already exists (same convention as
//      scripts/lib/people.ts), so re-runs and cross-seeders converge on one account.
//   3. unique name-token match (>= 2 shared tokens) against every existing leader-user.
//   4. otherwise a new person is created (auth user + domain user + slug).
//
// Dry-run by default; --apply writes. Report: scripts/out/seed-former-conflicts.{md,json}.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { and, eq, isNull, like, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { leaders, parties, partyMemberships, positions, users } from '../src/lib/server/db/schema';
import { user as authUsers } from '../src/lib/server/db/auth.schema';
import { generateLeaderSlug, slugify, splitName } from './lib/names';

const OUT_DIR = join(import.meta.dir, 'out');

// Swearing-in to swearing-in (9th: opening to dissolution), Nairobi time.
// 12th/11th come from mzalendo.com member pages; the 9th's only roster is
// Wikipedia's (mzalendo keeps no 9th-parliament pages, and neither has a 10th/8th list).
const PARLIAMENTS = [
	// Oldest first: insertion order then mirrors regime order, so unsorted
	// frontend reads come out chronologically by default.
	{ key: '9th', source: 'wikipedia', startAt: new Date('2003-01-14T00:00:00+03:00'), endAt: new Date('2007-10-22T00:00:00+03:00') },
	{ key: '11th', source: 'mzalendo', startAt: new Date('2013-03-28T00:00:00+03:00'), endAt: new Date('2017-08-31T00:00:00+03:00') },
	{ key: '12th', source: 'mzalendo', startAt: new Date('2017-08-31T00:00:00+03:00'), endAt: new Date('2022-09-13T00:00:00+03:00') }
] as const;

type MpEntry = {
	slug: string;
	url: string;
	name: string;
	constituency: string | null;
	county: string | null;
	party: string | null; // FULL party name
	status: string | null; // Elected | Nominated | Women's Representative
	bio: string | null;
	photoUrl: string | null;
	/** Set when the entry comes from a senate render: county is the seat. */
	chamber?: 'senate';
};

function nameTokens(name: string): string[] {
	return name.toLowerCase().replace(/[^a-z\s'-]/g, ' ').split(/\s+/).filter((t) => t.length > 2);
}

function tokenOverlap(a: string, b: string): number {
	const bTokens = new Set(nameTokens(b));
	return nameTokens(a).filter((t) => bTokens.has(t)).length;
}

/** "Forum for Restoration of Democracy- Kenya" and "FORD- KENYA" -> comparable keys. */
function partyKey(s: string): string {
	return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

type Finding = { category: string; name: string; parliament: string; region: string; detail: string };

const { values: flags } = parseArgs({ options: { apply: { type: 'boolean', default: false } } });

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const client = postgres(process.env.DATABASE_URL, { max: 1 });
const db = drizzle(client);

// ---------- preloads ----------

const positionRows = await db
	.select({ id: positions.id, title: positions.title, region: positions.region })
	.from(positions)
	.where(isNull(positions.deletedAt));
const positionByKey = new Map(positionRows.map((p) => [`${p.title}|${slugify(p.region)}`, p]));

const holderRows = await db
	.select({ positionId: leaders.positionId, userId: users.id, firstName: users.firstName, otherNames: users.otherNames })
	.from(leaders)
	.innerJoin(users, eq(leaders.userId, users.id))
	.where(and(eq(leaders.status, 'current'), isNull(leaders.deletedAt)));
const holderByPosition = new Map(holderRows.map((h) => [h.positionId, h]));

// Every person who has any leaders row — the name-match pool for repeat members.
const leaderUserRows = await db
	.selectDistinct({ userId: users.id, firstName: users.firstName, otherNames: users.otherNames, bio: users.bio })
	.from(leaders)
	.innerJoin(users, eq(leaders.userId, users.id))
	.where(isNull(leaders.deletedAt));

const seedEmailRows = await db
	.select({ email: authUsers.email, userId: users.id })
	.from(authUsers)
	.innerJoin(users, eq(users.authUserId, authUsers.id))
	.where(like(authUsers.email, '%@seed.leaders.ke'));
const userIdBySeedEmail = new Map(seedEmailRows.map((r) => [r.email, r.userId]));

const existingTermRows = await db
	.select({ userId: leaders.userId, positionId: leaders.positionId, startAt: leaders.startAt, endAt: leaders.endAt })
	.from(leaders)
	.where(isNull(leaders.deletedAt));
// Overlap-aware dedupe: a term already covering any part of the parliament's span
// (e.g. a year-granular leaders.json leadership row, or a by-elections partial term)
// blocks a second row for the same seat.
const termsByUserPosition = new Map<string, { start: number; end: number }[]>();
for (const r of existingTermRows) {
	const key = `${r.userId}|${r.positionId}`;
	const list = termsByUserPosition.get(key) ?? [];
	list.push({ start: r.startAt.getTime(), end: r.endAt?.getTime() ?? Infinity });
	termsByUserPosition.set(key, list);
}
function termOverlaps(userId: number, positionId: number, start: Date, end: Date): boolean {
	return (termsByUserPosition.get(`${userId}|${positionId}`) ?? []).some(
		(t) => t.start < end.getTime() && t.end > start.getTime()
	);
}
function recordTerm(userId: number, positionId: number, start: Date, end: Date): void {
	const key = `${userId}|${positionId}`;
	const list = termsByUserPosition.get(key) ?? [];
	list.push({ start: start.getTime(), end: end.getTime() });
	termsByUserPosition.set(key, list);
}

const partyRows = await db.select({ id: parties.id, name: parties.name, abbreviation: parties.abbreviation }).from(parties);
const partyIdByKey = new Map<string, number>();
for (const p of partyRows) {
	partyIdByKey.set(partyKey(p.name), p.id);
	if (p.abbreviation) partyIdByKey.set(partyKey(p.abbreviation), p.id);
}

// mzalendo person slug -> the 13th-parliament seat it holds, for match rule 1.
const mz13: MpEntry[] = JSON.parse(readFileSync(join(OUT_DIR, 'scraped-mps-13th.json'), 'utf8'));
const mzSenate13: MpEntry[] = JSON.parse(readFileSync(join(OUT_DIR, 'scraped-mps-senate-13th.json'), 'utf8'));
const seat13BySlug = new Map<string, { title: string; region: string }>();
for (const e of mz13) {
	if (/nominated/i.test(e.status ?? '')) continue;
	if (/women/i.test(e.status ?? '') && e.county) seat13BySlug.set(e.slug, { title: 'Woman Rep', region: e.county });
	else if (e.constituency) seat13BySlug.set(e.slug, { title: 'MP', region: e.constituency });
}
for (const e of mzSenate13) {
	if (!/nominated/i.test(e.status ?? '') && e.county) seat13BySlug.set(e.slug, { title: 'Senator', region: e.county });
}

// ---------- plan + apply ----------

const findings: Finding[] = [];
let termsAdded = 0;
let peopleCreated = 0;
let biosBackfilled = 0;
let membershipsAdded = 0;
let matchedBySlug = 0;
let matchedByEmail = 0;
let matchedByName = 0;
const partiesMissing = new Map<string, number>();

type WikiEntry = { name: string; seat: string; region: string; party: string; articleUrl: string | null; bio: string | null; photoUrl: string | null };

for (const parliament of PARLIAMENTS) {
	// mzalendo files are MpEntry-shaped already; wikipedia rosters map into the same shape.
	let entries: MpEntry[];
	if (parliament.source === 'mzalendo') {
		entries = JSON.parse(readFileSync(join(OUT_DIR, `scraped-mps-${parliament.key}.json`), 'utf8'));
		// The same parliament's senate render, tagged so seat resolution reads the
		// county as a Senator seat instead of a Woman Rep giveaway.
		const senate: MpEntry[] = JSON.parse(readFileSync(join(OUT_DIR, `scraped-mps-senate-${parliament.key}.json`), 'utf8'));
		entries = entries.concat(senate.map((e) => ({ ...e, chamber: 'senate' as const })));
	} else {
		const wiki: WikiEntry[] = JSON.parse(readFileSync(join(OUT_DIR, `scraped-wikipedia-${parliament.key}.json`), 'utf8'));
		entries = wiki.map((w) => ({
			slug: '', // no mzalendo person page — match rule 1 simply never fires
			url: w.articleUrl ?? '',
			name: w.name,
			constituency: w.seat === 'MP' ? w.region : null,
			county: w.seat === 'Woman Rep' ? w.region : null,
			party: w.party || null,
			status: w.seat === 'Woman Rep' ? "Women's Representative" : 'Elected',
			bio: w.bio,
			photoUrl: w.photoUrl
		}));
	}

	for (const entry of entries) {
		if (!entry.name?.trim()) continue;
		const flag = (category: string, detail: string) =>
			findings.push({ category, name: entry.name, parliament: parliament.key, region: entry.constituency ?? entry.county ?? '—', detail });

		// Seat: constituency MP, county Woman Rep, or county Senator (senate renders);
		// nominated members have no seat (see non-elected.json policy).
		let title: 'MP' | 'Woman Rep' | 'Senator';
		let region: string;
		if (entry.chamber === 'senate') {
			if (/nominated/i.test(entry.status ?? '') || !entry.county) {
				flag('nominated', `no geographic seat (status: ${entry.status ?? 'unknown'}) — recorded, not seeded`);
				continue;
			}
			title = 'Senator';
			region = entry.county;
		} else if (/women/i.test(entry.status ?? '') && entry.county) {
			title = 'Woman Rep';
			region = entry.county;
		} else if (entry.constituency) {
			title = 'MP';
			region = entry.constituency;
		} else {
			flag('nominated', `no geographic seat (status: ${entry.status ?? 'unknown'}) — recorded, not seeded`);
			continue;
		}
		const position = positionByKey.get(`${title}|${slugify(region)}`);
		if (!position) {
			// Constituencies renamed/redrawn between cycles land here.
			flag('position-missing', `no ${title} position matches "${region}"`);
			continue;
		}

		// ---- who is this? ----
		let userId: number | null = null;
		const seat13 = seat13BySlug.get(entry.slug);
		if (seat13) {
			const pos13 = positionByKey.get(`${seat13.title}|${slugify(seat13.region)}`);
			const holder = pos13 ? holderByPosition.get(pos13.id) : undefined;
			if (holder && tokenOverlap(entry.name, `${holder.firstName} ${holder.otherNames}`) > 0) {
				userId = holder.userId;
				matchedBySlug++;
			}
		}
		if (!userId) {
			const bySeedEmail = userIdBySeedEmail.get(`${slugify(entry.name)}@seed.leaders.ke`);
			if (bySeedEmail) {
				userId = bySeedEmail;
				matchedByEmail++;
			}
		}
		if (!userId) {
			// Subset guard on 2-token matches, same as dossier clustering: distinctive
			// tokens on BOTH sides means namesakes, never the same person.
			const entryTokens = new Set(nameTokens(entry.name));
			const scored = leaderUserRows
				.map((u) => {
					const uTokens = nameTokens(`${u.firstName} ${u.otherNames}`);
					const score = tokenOverlap(entry.name, `${u.firstName} ${u.otherNames}`);
					const subset =
						uTokens.every((t) => entryTokens.has(t)) || [...entryTokens].every((t) => uTokens.includes(t));
					return { u, score: score >= 3 || (score === 2 && subset) ? score : 0 };
				})
				.filter((s) => s.score >= 2)
				.sort((a, b) => b.score - a.score);
			if (scored.length && (scored.length === 1 || scored[0].score > scored[1].score)) {
				userId = scored[0].u.userId;
				matchedByName++;
			} else if (scored.length > 1) {
				flag('ambiguous-person', `${scored.length} existing people share ${scored[0].score} name tokens — skipped for manual review`);
				continue;
			}
		}

		// ---- create the person if new ----
		if (!userId) {
			peopleCreated++;
			if (flags.apply) {
				const { firstName, otherNames } = splitName(entry.name);
				const authId = randomUUID();
				await db.insert(authUsers).values({
					id: authId,
					name: entry.name,
					email: `${slugify(entry.name)}@seed.leaders.ke`,
					emailVerified: false
				});
				const slug = await generateLeaderSlug(db, entry.name);
				const [created] = await db
					.insert(users)
					.values({ authUserId: authId, firstName, otherNames, slug, ...(entry.bio ? { bio: entry.bio } : {}) })
					.returning({ id: users.id });
				userId = created.id;
			} else {
				userId = -peopleCreated; // dry-run placeholder so term/membership counts stay accurate
			}
			leaderUserRows.push({ userId, firstName: entry.name.split(' ')[0], otherNames: entry.name.split(' ').slice(1).join(' '), bio: entry.bio });
			userIdBySeedEmail.set(`${slugify(entry.name)}@seed.leaders.ke`, userId);
		} else if (entry.bio) {
			// Enrich a repeat person: fill a NULL bio, never overwrite.
			const known = leaderUserRows.find((u) => u.userId === userId);
			if (known && !known.bio) {
				if (flags.apply) await db.update(users).set({ bio: entry.bio }).where(and(eq(users.id, userId), isNull(users.bio)));
				known.bio = entry.bio;
				biosBackfilled++;
			}
		}

		// ---- the former term itself (one row per parliament — older terms are kept) ----
		if (termOverlaps(userId, position.id, parliament.startAt, parliament.endAt)) continue;
		recordTerm(userId, position.id, parliament.startAt, parliament.endAt);
		termsAdded++;
		let leaderId: number | null = null;
		if (flags.apply) {
			const [term] = await db
				.insert(leaders)
				.values({
					userId,
					positionId: position.id,
					status: 'former',
					description: `${parliament.key} Parliament`,
					startAt: parliament.startAt,
					endAt: parliament.endAt,
					verifiedAt: new Date()
				})
				.returning({ id: leaders.id });
			leaderId = term.id;
		}

		// ---- party at the time, attached to this term's row ----
		if (entry.party) {
			const partyId = partyIdByKey.get(partyKey(entry.party));
			if (!partyId) {
				partiesMissing.set(entry.party, (partiesMissing.get(entry.party) ?? 0) + 1);
			} else {
				membershipsAdded++;
				if (flags.apply && leaderId) {
					await db.insert(partyMemberships).values({
						partyId,
						leaderId,
						role: 'Member',
						startAt: parliament.startAt,
						endAt: parliament.endAt
					});
				}
			}
		}
	}
}

// ---------- report ----------

for (const [party, n] of [...partiesMissing.entries()].sort((a, b) => b[1] - a[1])) {
	findings.push({ category: 'party-not-in-db', name: party, parliament: '—', region: '—', detail: `${n} memberships skipped — party not in the parties table` });
}

const byCategory = new Map<string, Finding[]>();
for (const f of findings) byCategory.set(f.category, [...(byCategory.get(f.category) ?? []), f]);

const summary = [
	`Terms to add: ${termsAdded}`,
	`New people: ${peopleCreated}`,
	`Repeat people matched: ${matchedBySlug} by mzalendo slug, ${matchedByEmail} by seed email, ${matchedByName} by name`,
	`Bios backfilled: ${biosBackfilled}`,
	`Party memberships: ${membershipsAdded}`,
	...[...byCategory.entries()].map(([c, rows]) => `${c}: ${rows.length}`)
];

const md = [
	'# 12th/11th-parliament former-term seed: report',
	'',
	`Generated ${new Date().toISOString()} — ${flags.apply ? 'APPLIED' : 'dry-run'}.`,
	'',
	'## Summary',
	'',
	...summary.map((s) => `- ${s}`),
	'',
	...[...byCategory.entries()].flatMap(([category, rows]) => [
		`## ${category} (${rows.length})`,
		'',
		'| Name | Parliament | Region | Detail | Instruction |',
		'| --- | --- | --- | --- | --- |',
		...rows.map((f) => `| ${f.name} | ${f.parliament} | ${f.region} | ${f.detail} | |`),
		''
	])
].join('\n');

writeFileSync(join(OUT_DIR, 'seed-former-conflicts.md'), md);
writeFileSync(join(OUT_DIR, 'seed-former-conflicts.json'), JSON.stringify({ summary, findings }, null, '\t'));
console.log(summary.map((s) => `[former] ${s}`).join('\n'));
console.log(flags.apply ? '[former] applied.' : '[former] dry-run — re-run with --apply to write.');
await client.end();
