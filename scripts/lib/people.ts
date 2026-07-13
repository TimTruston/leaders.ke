// Shared person-seeding logic for the 'leaders' and 'mcas' phases (same account
// chain, just different source files and volume). Each candidate needs a full
// chain: better-auth `user` -> domain `users` -> `leaders`, plus a
// `party_memberships` link when the row names a party. Parties are looked up
// only (never created here) — the 'parties' phase is the sole source of `parties`
// rows, so seeding order matters: parties, then leaders/mcas.
import { randomUUID } from 'node:crypto';
import { and, eq, isNull, or } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { campaigns, contacts, experience, leaders, parties, partyMemberships, pillars, positions, users } from '../../src/lib/server/db/schema';
import { user as authUsers, account } from '../../src/lib/server/db/auth.schema';
import { generateLeaderSlug, slugify, splitName, type AnyDb } from './names';

export type ExperienceRow = { title: string; institution: string; startAt: string | null; endAt: string | null };
// A prior/current elective or nominated term nested on a person's leaders.json row (e.g. an
// ex-MP seat before their current one) — seeded as its own `leaders` row, not `experience`,
// since it's the same "held/holds a position" fact the top-level row represents.
export type LeadershipRow = { title: string; region: string; description?: string; startAt: string | null; endAt: string | null };
export type ContactRow = { title: string; value: string };
export type SocialRow = { title: string; value: string; href?: string };
export type PillarRow = { title: string; summary: string; deliveryStatus?: 'promised' | 'in_progress' | 'delivered'; evidence?: string };

export type PersonRow = {
	name: string;
	party?: string;
	title: string;
	region: string;
	status: 'current' | 'aspirant' | 'former';
	bio?: string;
	education?: ExperienceRow[];
	professional?: ExperienceRow[];
	leadership?: LeadershipRow[];
	contacts?: ContactRow[];
	social?: SocialRow[];
	pillars?: PillarRow[];
};

/** "1997-01-01" | null -> a Date | null, as stored on education/professional/leadership rows. */
function toDate(iso: string | null | undefined): Date | null {
	return iso ? new Date(`${iso}T00:00:00+03:00`) : null;
}

/** Writes a candidate profile's scraped bio/education/professional/leadership/contacts/social
 * onto an already-created leader + domain user. Shared by the fresh-insert and already-seeded-
 * backfill paths below, and safe to re-run (contacts dedupe on the channel+value unique index).
 * `ownPositionId` is the position this leaderId row itself already represents, so a
 * `leadership[]` entry for that same seat doesn't get double-inserted as a second row. */
async function applyProfile(db: AnyDb, userId: number, leaderId: number, ownPositionId: number, row: PersonRow) {
	const office = row.contacts?.find((c) => c.title.trim().toLowerCase() === 'office');
	if (row.bio || office) {
		await db
			.update(users)
			.set({ ...(row.bio ? { bio: row.bio } : {}), ...(office ? { address: office.value } : {}) })
			.where(eq(users.id, userId));
	}

	if (row.social?.length) {
		const socials: Record<string, string> = {};
		for (const s of row.social) socials[s.title.trim().toLowerCase()] = s.href ?? s.value;
		await db.update(users).set({ socials }).where(eq(users.id, userId));
	}

	for (const contactRow of row.contacts ?? []) {
		const key = contactRow.title.trim().toLowerCase();
		const channel = key === 'email' ? 'email' : key === 'phone' ? 'sms' : null;
		if (!channel) continue; // freeform keys like "Office" aren't a reachable channel
		await db.insert(contacts).values({ userId, channel, value: contactRow.value }).onConflictDoNothing();
	}

	for (const [type, rows] of [
		['education', row.education] as const,
		['professional', row.professional] as const
	]) {
		for (const expRow of rows ?? []) {
			const [existing] = await db
				.select({ id: experience.id })
				.from(experience)
				.where(
					and(
						eq(experience.leaderId, leaderId),
						eq(experience.type, type),
						eq(experience.title, expRow.title),
						eq(experience.institution, expRow.institution)
					)
				);
			if (existing) continue;
			await db.insert(experience).values({
				leaderId,
				type,
				title: expRow.title,
				institution: expRow.institution,
				startAt: toDate(expRow.startAt),
				endAt: toDate(expRow.endAt)
			});
		}
	}

	// Prior/other elective or nominated terms: each becomes its own `leaders` row (Track
	// Record), not an `experience` row — same model the top-level leaders.json row uses.
	for (const term of row.leadership ?? []) {
		const [position] = await db
			.select({ id: positions.id })
			.from(positions)
			.where(and(eq(positions.title, term.title), eq(positions.region, term.region), isNull(positions.deletedAt)));
		if (!position) {
			console.warn(`no ${term.title} position found for region "${term.region}" (leadership term for ${row.name}), skipping`);
			continue;
		}
		if (position.id === ownPositionId) continue; // same seat as this row's own position — already represented

		const [existing] = await db
			.select({ id: leaders.id })
			.from(leaders)
			.where(and(eq(leaders.userId, userId), eq(leaders.positionId, position.id), isNull(leaders.deletedAt)));
		if (existing) continue;

		const startAt = toDate(term.startAt) ?? INCUMBENT_START; // schema requires a start; same fallback as the main insert below
		await db.insert(leaders).values({
			userId,
			positionId: position.id,
			status: 'former', // a leadership[] entry is always a prior/other term, never this row's own current/aspirant seat
			description: term.description,
			startAt,
			endAt: toDate(term.endAt),
			verifiedAt: new Date()
		});
	}

	if (row.pillars?.length) {
		// Pillars belong to the leader's main campaign, not the leader directly (mirrors
		// getOrCreateMainCampaign in src/lib/server/leader.ts — duplicated here rather than
		// imported since that module pulls in $env/dynamic/private via $lib/server/db, which
		// only resolves inside SvelteKit/Vite, not a plain `bun run` script).
		let [campaign] = await db
			.select({ id: campaigns.id })
			.from(campaigns)
			.where(and(eq(campaigns.leaderId, leaderId), isNull(campaigns.parentCampaignId), isNull(campaigns.deletedAt)));
		if (!campaign) {
			[campaign] = await db
				.insert(campaigns)
				.values({
					creatorId: userId,
					leaderId,
					title: `${row.name}'s Campaign`,
					description: `${row.name}'s campaign for office.`
				})
				.returning({ id: campaigns.id });
		}

		for (const pillarRow of row.pillars) {
			const [existing] = await db
				.select({ id: pillars.id })
				.from(pillars)
				.where(and(eq(pillars.campaignId, campaign.id), eq(pillars.title, pillarRow.title), isNull(pillars.deletedAt)));
			if (existing) continue;
			await db.insert(pillars).values({
				campaignId: campaign.id,
				title: pillarRow.title,
				summary: pillarRow.summary,
				deliveryStatus: pillarRow.deliveryStatus ?? 'promised',
				evidence: pillarRow.evidence ?? null
			});
		}
	}
}

// Current term start = the 2022 swearing-in (also used as a placeholder start
// for 'former' rows until a row supplies its own dates); aspirants carry a
// future start date (2027 election day), matching the schema's convention.
const INCUMBENT_START = new Date('2022-09-13T00:00:00+03:00');
const ASPIRANT_START = new Date('2027-08-10T00:00:00+03:00');

export async function seedPeople(db: AnyDb, rows: PersonRow[], label: string) {
	let seeded = 0;
	let skipped = 0;
	let missingPosition = 0;

	for (const row of rows) {
		const [position] = await db
			.select({ id: positions.id })
			.from(positions)
			.where(and(eq(positions.title, row.title), eq(positions.region, row.region), isNull(positions.deletedAt)));
		if (!position) {
			console.warn(`no ${row.title} position found for region "${row.region}", skipping ${row.name}`);
			missingPosition++;
			continue;
		}

		let partyId: number | null = null;
		if (row.party) {
			// Matches either the full registered name or the ORPP abbreviation — leaders.json/
			// mcas.json rows reference parties by whichever form was on hand at data-entry time.
			const [party] = await db
				.select({ id: parties.id })
				.from(parties)
				.where(or(eq(parties.name, row.party), eq(parties.abbreviation, row.party)));
			if (party) partyId = party.id;
			else console.warn(`party "${row.party}" not found (run the parties phase first) — skipping membership for ${row.name}`);
		}

		// Person-level idempotency check runs BEFORE the seat-availability guard below, so an
		// already-seeded current still gets a chance to backfill a missing party_membership
		// (e.g. the parties table was rebuilt after leaders/mcas already ran) instead of being
		// short-circuited by "this seat already has an current."
		const email = `${slugify(row.name)}@seed.leaders.ke`;
		const [already] = await db.select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.email, email));

		// The auth/domain user survives a `db:seed` reset (only seed-managed tables like
		// `leaders` get truncated), so an existing account with no matching `leaders` row
		// means: reattach a fresh leader to that account rather than skipping outright.
		const existingDomainUser = already
			? (await db.select({ id: users.id }).from(users).where(eq(users.authUserId, already.id)))[0]
			: undefined;

		if (already && existingDomainUser) {
			const existingLeader = await findLeader(db, row.name, row.title, row.region);
			if (existingLeader) {
				if (partyId) {
					const [existingMembership] = await db
						.select({ id: partyMemberships.id })
						.from(partyMemberships)
						.where(
							and(eq(partyMemberships.leaderId, existingLeader.id), eq(partyMemberships.partyId, partyId), isNull(partyMemberships.deletedAt))
						);
					if (!existingMembership) {
						const startAt = row.status === 'aspirant' ? ASPIRANT_START : INCUMBENT_START;
						await db.insert(partyMemberships).values({ partyId, leaderId: existingLeader.id, role: 'Member', startAt });
					}
				}
				await applyProfile(db, existingLeader.userId, existingLeader.id, position.id, row);
				skipped++;
				continue;
			}
			// Account exists, but no leaders row for this seat (e.g. post-reset) — fall through
			// to create just the leaders row below, reusing this domain user.
		}

		// A seat can only have one live current (DB constraint); check regardless of who's
		// already seeded there, since a prior run may have used a different data source/spelling.
		if (row.status === 'current') {
			const [existingCurrent] = await db
				.select({ id: leaders.id })
				.from(leaders)
				.where(and(eq(leaders.positionId, position.id), eq(leaders.status, 'current'), isNull(leaders.deletedAt)));
			if (existingCurrent) {
				skipped++;
				continue;
			}
		}

		// Wrapped so a failure partway (e.g. a race on the current constraint) never
		// leaves an orphan auth/domain-user row with no attached leader.
		await db.transaction(async (tx) => {
			let domainUserId = existingDomainUser?.id;

			if (!domainUserId) {
				const { firstName, otherNames } = splitName(row.name);
				const authId = randomUUID();
				await tx.insert(authUsers).values({ id: authId, name: row.name, email, emailVerified: false });

				const slug = await generateLeaderSlug(tx, row.name);
				const [domainUser] = await tx
					.insert(users)
					.values({ authUserId: authId, firstName, otherNames, slug, verifiedAt: new Date() })
					.returning({ id: users.id });
				domainUserId = domainUser.id;
			} else {
				// Reattaching a leaders row to an existing account (post-reset): give it a
				// slug now if it somehow doesn't have one yet.
				const [existingUser] = await tx.select({ slug: users.slug }).from(users).where(eq(users.id, domainUserId));
				if (!existingUser.slug) {
					const slug = await generateLeaderSlug(tx, row.name);
					await tx.update(users).set({ slug }).where(eq(users.id, domainUserId));
				}
			}

			const startAt = row.status === 'aspirant' ? ASPIRANT_START : INCUMBENT_START;
			const [leader] = await tx
				.insert(leaders)
				.values({
					userId: domainUserId,
					positionId: position.id,
					status: row.status,
					startAt,
					verifiedAt: new Date() // required to surface on the /vote/2027 ballot (verified-only)
				})
				.returning({ id: leaders.id });

			if (partyId) {
				await tx.insert(partyMemberships).values({ partyId, leaderId: leader.id, role: 'Member', startAt });
			}

			await applyProfile(tx, domainUserId, leader.id, position.id, row);
		});

		seeded++;
	}

	console.log(`[${label}] seeded ${seeded}, skipped ${skipped} already-seeded, ${missingPosition} missing a position`);
}

/** Resolves a person to their leader row (id + owning user) via exact name + position title/region match. */
export async function findLeader(
	db: AnyDb,
	name: string,
	title: string,
	region: string
): Promise<{ id: number; userId: number } | null> {
	const { firstName, otherNames } = splitName(name);
	const [row] = await db
		.select({ id: leaders.id, userId: leaders.userId })
		.from(leaders)
		.innerJoin(users, eq(leaders.userId, users.id))
		.innerJoin(positions, eq(leaders.positionId, positions.id))
		.where(
			and(
				eq(users.firstName, firstName),
				eq(users.otherNames, otherNames),
				eq(positions.title, title),
				eq(positions.region, region),
				isNull(leaders.deletedAt)
			)
		);
	return row ?? null;
}

/** Resolves a person to their leader row by name alone (any position) — for content that doesn't pin a level/region. */
export async function findAnyLeaderByName(
	db: AnyDb,
	name: string
): Promise<{ id: number; userId: number; slug: string | null } | null> {
	const { firstName, otherNames } = splitName(name);
	const [row] = await db
		.select({ id: leaders.id, userId: leaders.userId, slug: users.slug })
		.from(leaders)
		.innerJoin(users, eq(leaders.userId, users.id))
		.where(and(eq(users.firstName, firstName), eq(users.otherNames, otherNames), isNull(leaders.deletedAt)));
	return row ?? null;
}

/** The first available (non-deleted) leader, used as a fallback tag target for undirected dummy content. */
export async function findFirstLeader(db: AnyDb): Promise<{ id: number } | null> {
	const [row] = await db.select({ id: leaders.id }).from(leaders).where(isNull(leaders.deletedAt)).limit(1);
	return row ?? null;
}

/**
 * Domain user id for the one fixed system/dev-admin account — creatorId for content
 * with no natural author (e.g. aggregated civic issues), and also a real, loginable
 * account (ADMIN_NAME/ADMIN_EMAIL/ADMIN_PASSWORD from .env) so a developer can sign
 * in locally as a platform admin. Always the first thing seeded, so on a fresh DB
 * its id is the lowest/first user id.
 */
export async function getOrCreateSystemUser(db: AnyDb): Promise<number> {
	const name = process.env.ADMIN_NAME;
	const email = process.env.ADMIN_EMAIL;
	const password = process.env.ADMIN_PASSWORD;
	if (!name || !email || !password) {
		throw new Error('ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD must be set (see .env) to seed the system user.');
	}
	const { firstName, otherNames } = splitName(name);

	const [existingAuth] = await db.select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.email, email));
	if (existingAuth) {
		const [existingUser] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.authUserId, existingAuth.id));
		if (existingUser) {
			console.log(`[system-user] ${email} already exists (user id ${existingUser.id}), skipping`);
			return existingUser.id;
		}
	}

	const authId = randomUUID();
	await db.insert(authUsers).values({ id: authId, name, email, emailVerified: true });
	// providerId/accountId match better-auth's own email+password signup convention
	// (accountId = the auth user's own id) so this account logs in exactly like any other.
	await db.insert(account).values({
		id: randomUUID(),
		accountId: authId,
		providerId: 'credential',
		userId: authId,
		password: await hashPassword(password)
	});
	const [domainUser] = await db
		.insert(users)
		.values({ authUserId: authId, firstName, otherNames, adminAt: new Date() })
		.returning({ id: users.id });
	console.log(`[system-user] seeded ${email} (user id ${domainUser.id}, platform admin)`);
	return domainUser.id;
}
