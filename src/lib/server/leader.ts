// Leader resolution shared by the dashboard and public taxonomy pages.
// URL scheme (docs/URLDiscovery.md): every leader has one permanent flat URL,
// /<slug> (+ /<slug>/<year> for their active campaign workspace). Seat-level
// pages stay position-first: /<position>/<region> (or just /<position> for
// single-region national seats like President).
import { randomUUID } from 'node:crypto';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, leaders, managers, positions, users } from '$lib/server/db/schema';
import { user as authUsers } from '$lib/server/db/auth.schema';

/**
 * Creates the leader's own `users` row, separate from whichever citizen account
 * is creating it — so editing the leader's profile/contacts never touches the
 * creator's own login identity. Backed by a placeholder auth-user row (never
 * used for login, same convention as seeded candidates' `{slug}@seed.leaders.ke`).
 */
export async function createPhantomUser(firstName: string, otherNames: string) {
	const authId = randomUUID();
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

// Top-level static routes a leader slug must never shadow.
const RESERVED_SLUGS = [
	'leaders',
	'pricing',
	'compare',
	'ranks',
	'vote',
	'search',
	'parties',
	'alliances',
	'invite',
	'claim',
	'dashboard',
	'features',
	'demo',
	'logout',
	'login',
	'signup',
	'change-email',
	'change-password',
	'delete-account',
	'forgot-password',
	'reset-password'
];

/** Whether a candidate slug is free to take: not a reserved route, and not already
 * used by another person (rows belonging to `excludeUserId`, if given, don't count —
 * so a person can "claim" their own current slug unchanged). */
export async function isSlugAvailable(slug: string, excludeUserId?: number): Promise<boolean> {
	if (!slug || RESERVED_SLUGS.includes(slug)) return false;
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
	const base = slugify(name);
	let candidate = base;
	let n = 1;
	// eslint-disable-next-line no-constant-condition
	while (true) {
		if (!RESERVED_SLUGS.includes(candidate) && (await isSlugAvailable(candidate))) {
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

	const [managed] = await db
		.select()
		.from(managers)
		.innerJoin(leaders, eq(managers.leaderId, leaders.id))
		.innerJoin(positions, eq(leaders.positionId, positions.id))
		.innerJoin(users, eq(leaders.userId, users.id))
		.where(
			and(
				eq(managers.userId, domainUserId),
				eq(managers.isActive, true),
				isNull(managers.deletedAt),
				isNull(leaders.deletedAt)
			)
		)
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

/** Resolves /[position]/[region] to its positions row (or null). */
export async function findPositionByPath(position: string, region: string) {
	const rows = await db.select().from(positions).where(isNull(positions.deletedAt));
	return (
		rows.find((p) => slugify(p.title) === position && slugify(p.region) === region) ?? null
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
		(r) => slugify(r.positions.title) === position && slugify(r.positions.region) === region
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

	const [created] = await db
		.insert(campaigns)
		.values({
			creatorId,
			leaderId,
			title: `${leaderName}'s Campaign`,
			description: `${leaderName}'s campaign for office.`
		})
		.returning();
	return created;
}
