// Leader resolution shared by the dashboard and public taxonomy pages.
// URL scheme (docs/URLDiscovery.md): every leader has one permanent flat URL,
// /<slug> (+ /<slug>/<year> for their active campaign workspace). Seat-level
// pages stay position-first: /<position>/<region> (or just /<position> for
// single-region national seats like President).
import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, leaders, managers, positions, users } from '$lib/server/db/schema';
import { user as authUsers } from '$lib/server/db/auth.schema';
import { getPlatformSettings } from '$lib/server/settings';
import { positionSlug } from '$lib/utils/seat';

/**
 * Creates the leader's own `users` row, separate from whichever citizen account
 * is creating it — so editing the leader's profile/contacts never touches the
 * creator's own login identity. Backed by a placeholder auth-user row (never
 * used for login, same convention as seeded candidates' `{slug}@seed.leaders.ke`).
 */
export async function createPhantomUser(firstName: string, otherNames: string, applyId?: string) {
	// /dashboard/apply/[id]/* pre-mints the application's UUID; using it as the
	// phantom's auth id keeps that URL stable for the whole application.
	const authId = applyId ?? randomUUID();
	const placeholderEmail = `leader-${authId}@phantom.leaders.ke`;
	await db.insert(authUsers).values({ id: authId, name: `${firstName} ${otherNames}`.trim(), email: placeholderEmail, emailVerified: false });

	const [profile] = await db.insert(users).values({ authUserId: authId, firstName, otherNames }).returning();
	return profile;
}

/** kebab-cases a label for URL segments: "Woman Rep" -> "woman-rep", "Murang'a" -> "muranga" */
export function slugify(input: string): string {
	return input
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '') // strip accents
		.replace(/['’]/g, '') // Murang'a -> muranga
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');
}

export function fullName(u: { firstName: string; otherNames: string }): string {
	return `${u.firstName} ${u.otherNames}`.trim();
}

/** Whether the platform keeps this slug for itself: a numeric-only slug (ballot
 * routes use bare years like "2027") or a word on the admin-tunable blocked list
 * (platform_settings.blockedSlugs — seeded with every route a leader slug must
 * never shadow, plus words the platform may want later). */
async function isSlugBlocked(slug: string): Promise<boolean> {
	if (/^[0-9-]+$/.test(slug)) return true;
	// "admin"-adjacent slugs are always reserved, pattern-wide (not just the bare
	// "admin" on the list below): nobody may take admin-* or *-admin, since such a
	// URL reads as a platform-admin page (and /platform-admin is the dev demo leader).
	if (/(^|-)admin($|-)/.test(slug)) return true;
	const { blockedSlugs } = await getPlatformSettings();
	return blockedSlugs.includes(slug);
}

/** Whether a candidate slug is free to take: not blocked by the platform, and not
 * already used by another person (rows belonging to `excludeUserId`, if given, don't
 * count — so a person can "claim" their own current slug unchanged). */
export async function isSlugAvailable(slug: string, excludeUserId?: number): Promise<boolean> {
	if (!slug || (await isSlugBlocked(slug))) return false;
	const [existing] = await db
		.select({ id: users.id })
		.from(users)
		.where(and(eq(users.slug, slug), isNull(users.deletedAt)));
	return !existing || existing.id === excludeUserId;
}

/** Generates this person's permanent slug, suffixing "-2", "-3"... on collision
 * (against reserved routes and every other user's slug). Call once, at creation
 * time; every later `leaders` row for the same person just points at this user. */
export async function generateLeaderSlug(name: string): Promise<string> {
	// A numeric-only base can never pass the blocked-slug check (nor can any of its
	// "-2", "-3"... variants), so prefix it rather than loop forever.
	let base = slugify(name);
	if (!base || /^[0-9-]+$/.test(base)) base = `leader-${base}`.replace(/-$/, '');
	let candidate = base;
	let n = 1;
	// eslint-disable-next-line no-constant-condition
	while (true) {
		if (await isSlugAvailable(candidate)) {
			return candidate;
		}
		n++;
		candidate = `${base}-${n}`;
	}
}

export type LeaderContext = {
	leader: typeof leaders.$inferSelect;
	position: typeof positions.$inferSelect;
	profileUser: typeof users.$inferSelect; // the person the leader page is about
	role: 'leader' | 'manager';
};

/** The domain profile bridged to the signed-in auth user. */
export async function getDomainUser(authUserId: string) {
	const [profile] = await db.select().from(users).where(eq(users.authUserId, authUserId));
	return profile;
}

/**
 * The leader profile this user works on: their own if they have one,
 * otherwise the first leader they actively manage. Null before onboarding.
 */
export async function getLeaderContext(domainUserId: number): Promise<LeaderContext | null> {
	const [own] = await db
		.select()
		.from(leaders)
		.innerJoin(positions, eq(leaders.positionId, positions.id))
		.innerJoin(users, eq(leaders.userId, users.id))
		.where(and(eq(leaders.userId, domainUserId), isNull(leaders.deletedAt)))
		.limit(1);
	if (own) {
		return { leader: own.leaders, position: own.positions, profileUser: own.users, role: 'leader' };
	}

	// Most recently joined first — someone managing several people should land on the
	// one they just accepted an invite for, not an arbitrary older one. Managers attach
	// to the person, so join through subjectUserId and anchor to that person's active
	// term (latest start = their current/aspirant seat, the workspace anchor).
	const [managed] = await db
		.select()
		.from(managers)
		.innerJoin(users, eq(managers.subjectUserId, users.id))
		.innerJoin(leaders, eq(leaders.userId, users.id))
		.innerJoin(positions, eq(leaders.positionId, positions.id))
		.where(
			and(
				eq(managers.userId, domainUserId),
				eq(managers.isActive, true),
				isNull(managers.deletedAt),
				isNull(leaders.deletedAt)
			)
		)
		.orderBy(desc(managers.id), desc(leaders.startAt))
		.limit(1);
	if (managed) {
		return {
			leader: managed.leaders,
			position: managed.positions,
			profileUser: managed.users,
			role: 'manager'
		};
	}

	return null;
}

/** Whether a string looks like the UUID minted for a /dashboard/apply/[id] URL. */
export function isApplyId(id: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/** A viewer's active manager row on ANY term of a person: managers attach to the
 * PERSON, not one term, so management authority spans a leader's whole Track Record.
 * A manager added to one campaign keeps access when a new term becomes the live seat,
 * and (per the accepted trade-off) can edit historical terms too. Returns the row's
 * roles so callers can read the admin flag; null when the viewer manages no term. */
async function findPersonManager(
	domainUserId: number,
	subjectUserId: number
): Promise<{ roles: typeof managers.$inferSelect.roles } | null> {
	const [manager] = await db
		.select({ roles: managers.roles })
		.from(managers)
		.where(
			and(
				eq(managers.userId, domainUserId),
				eq(managers.subjectUserId, subjectUserId),
				eq(managers.isActive, true),
				isNull(managers.deletedAt)
			)
		);
	return manager ?? null;
}

/** The person (users.id) behind a leaders-row (term) id — for flows that arrive with
 * a term id but write person-scoped rows. */
export async function personIdForLeader(leaderId: number): Promise<number | null> {
	const [row] = await db.select({ userId: leaders.userId }).from(leaders).where(eq(leaders.id, leaderId));
	return row?.userId ?? null;
}

/** A person's ACTIVE term (latest start = current/aspirant seat) joined to its seat —
 * the anchor for person-scoped flows that still need a term (ambassador placement,
 * invite display, dashboard base paths). Null for a person with no terms. */
export async function activeTermForPerson(subjectUserId: number) {
	const [row] = await db
		.select()
		.from(leaders)
		.innerJoin(positions, eq(leaders.positionId, positions.id))
		.where(and(eq(leaders.userId, subjectUserId), isNull(leaders.deletedAt)))
		.orderBy(desc(leaders.startAt))
		.limit(1);
	return row ?? null;
}

/**
 * The leader context for a /dashboard/apply/[id]/* URL. The id is the
 * application's pre-minted UUID, which becomes the phantom user's auth id on
 * first profile save — so before that save this resolves to null (a blank
 * application), and afterwards to the in-progress profile. 'denied' when the
 * application exists but the viewer isn't on its team.
 */
export async function getLeaderContextByApplyId(
	applyId: string,
	domainUserId: number
): Promise<LeaderContext | 'denied' | null> {
	if (!isApplyId(applyId)) return 'denied';
	// A person can hold several leaders rows (a Track Record spanning terms); resolve
	// to the active one (latest start = current/aspirant seat), mirroring
	// resolveCurrentTerm, so the team/manager check runs against the seat being worked
	// on — not an arbitrary former term the manager was never added to.
	const [row] = await db
		.select()
		.from(users)
		.innerJoin(leaders, eq(leaders.userId, users.id))
		.innerJoin(positions, eq(leaders.positionId, positions.id))
		.where(and(eq(users.authUserId, applyId), isNull(users.deletedAt), isNull(leaders.deletedAt)))
		.orderBy(desc(leaders.startAt));
	if (!row) return null;

	if (row.leaders.userId === domainUserId) {
		return { leader: row.leaders, position: row.positions, profileUser: row.users, role: 'leader' };
	}
	// Person-level: a manager of any of this person's terms may work the profile.
	const manager = await findPersonManager(domainUserId, row.users.id);
	if (!manager) return 'denied';

	return { leader: row.leaders, position: row.positions, profileUser: row.users, role: 'manager' };
}

/**
 * The leader context for an explicit /dashboard/[slug]/* URL — the URL, not
 * guesswork, picks which campaign is active (a person can manage several).
 * Returns null when the slug doesn't resolve or the viewer has no access
 * (not the leader's own profile and not an active manager of it).
 */
export async function getLeaderContextBySlug(slug: string, domainUserId: number): Promise<LeaderContext | null> {
	// One person can hold several `leaders` rows (Track Record) — resolveCurrentTerm
	// picks the live campaign as the anchor term, not whichever row a bare slug join
	// happens to hit.
	const resolved = await resolveCurrentTerm(slug);
	if (!resolved) return null;
	const { row, currentTerm } = resolved;

	if (currentTerm.leaders.userId === domainUserId) {
		return { leader: currentTerm.leaders, position: currentTerm.positions, profileUser: row.users, role: 'leader' };
	}

	// Person-level: a manager of any of this person's terms may work the profile.
	const manager = await findPersonManager(domainUserId, row.users.id);
	if (!manager) return null;

	return { leader: currentTerm.leaders, position: currentTerm.positions, profileUser: row.users, role: 'manager' };
}

/** The active election cycle; campaign workspace URLs end with this year. */
export const ACTIVE_CYCLE = 2027;

/** Permanent leader record URL: /<slug>. */
export function leaderPath(leader: { slug: string | null }): string {
	return `/${leader.slug}`;
}

/** Active campaign workspace URL: the leader's permanent path plus the cycle year. */
export function campaignPath(leader: { slug: string | null }, year: number = ACTIVE_CYCLE): string {
	return `${leaderPath(leader)}/${year}`;
}

/** Resolves /[position]/[region] (canonical plural position slug) to its positions row (or null). */
export async function findPositionByPath(position: string, region: string) {
	const rows = await db.select().from(positions).where(isNull(positions.deletedAt));
	return (
		rows.find((p) => positionSlug(p.title) === position && slugify(p.region) === region) ?? null
	);
}

/** Resolves a flat /[leader] slug to a DB leader (or null). Since one person can
 * hold several `leaders` rows (Track Record), this returns whichever row was
 * looked up first — callers needing the full history query by userId instead. */
export async function findLeaderBySlug(slug: string) {
	const [row] = await db
		.select()
		.from(users)
		.innerJoin(leaders, eq(leaders.userId, users.id))
		.innerJoin(positions, eq(leaders.positionId, positions.id))
		.where(and(eq(users.slug, slug), isNull(users.deletedAt), isNull(leaders.deletedAt)));
	return row ?? null;
}

/** The seat a /[leader] page (and its /[year] campaign workspace) leads with:
 * whichever term has a live campaign (not 'former'), else the most recent past
 * term. Shared so both routes resolve the identical leader row for one slug —
 * a person can hold several `leaders` rows, and picking different ones per
 * route was a real bug (reviews/verification diverging between the two pages). */
export async function resolveCurrentTerm(slug: string) {
	const row = await findLeaderBySlug(slug);
	if (!row) return null;

	const terms = await db
		.select()
		.from(leaders)
		.innerJoin(positions, eq(leaders.positionId, positions.id))
		.where(and(eq(leaders.userId, row.users.id), isNull(leaders.deletedAt)));

	const currentTerm =
		terms.find((t) => t.leaders.status !== 'former') ??
		terms.toSorted((a, b) => b.leaders.startAt.getTime() - a.leaders.startAt.getTime())[0];

	return { row, terms, currentTerm };
}

/** All verified leaders (joined to person + seat) for one position/region pair —
 * public seat-hub pages only ever show verified profiles. */
export async function listLeadersForSeat(position: string, region: string) {
	const rows = await db
		.select()
		.from(leaders)
		.innerJoin(positions, eq(leaders.positionId, positions.id))
		.innerJoin(users, eq(leaders.userId, users.id))
		.where(and(isNull(leaders.deletedAt), isNotNull(leaders.verifiedAt)));

	return rows.filter(
		(r) => positionSlug(r.positions.title) === position && slugify(r.positions.region) === region
	);
}

/**
 * The leader's main campaign (parentCampaignId null), creating it lazily on
 * first use so the dashboard can attach pillars/posts/etc. without a separate
 * "create your campaign" step. Mirrors the leader==main-campaign model from
 * SIMPLIFY.md's Option B.
 */
export async function getOrCreateMainCampaign(leaderId: number, creatorId: number, leaderName: string) {
	const [existing] = await db
		.select()
		.from(campaigns)
		.where(and(eq(campaigns.leaderId, leaderId), isNull(campaigns.parentCampaignId), isNull(campaigns.deletedAt)));
	if (existing) return existing;

	// A campaign is one run at one seat in one cycle — stamp both from its term.
	const [term] = await db.select({ positionId: leaders.positionId, startAt: leaders.startAt }).from(leaders).where(eq(leaders.id, leaderId));
	const [created] = await db
		.insert(campaigns)
		.values({
			creatorId,
			leaderId,
			positionId: term.positionId,
			cycleYear: term.startAt.getFullYear(),
			title: `${leaderName}'s Campaign`,
			description: `${leaderName}'s campaign for office.`
		})
		.returning();
	return created;
}
