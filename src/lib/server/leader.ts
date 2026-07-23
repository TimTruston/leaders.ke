// Leader resolution shared by the dashboard and public taxonomy pages.
// URL scheme (docs/URLDiscovery.md): every leader has one permanent flat URL,
// /<slug> (+ /<slug>/<year> for their active campaign workspace). Seat-level
// pages stay position-first: /<position>/<region> (or just /<position> for
// single-region national seats like President).
import { randomUUID } from 'node:crypto';
import { and, desc, eq, ilike, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, contacts, leaders, managers, parties, positions, users } from '$lib/server/db/schema';
import { user as authUsers } from '$lib/server/db/auth.schema';
import { getPlatformSettings } from '$lib/server/settings';
import { signoffComplete, type ManagerRoles } from '$lib/utils/campaignRoles';
import { positionSlug } from '$lib/utils/seat';

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
	// A numeric-only base, or one that contains "admin" as a whole word (e.g. someone
	// literally named "Admin"), can never pass the blocked-slug check — suffixing with
	// "-2", "-3"... doesn't help since admin-tim-2 still starts with "admin-" and is
	// STILL blocked. Both are permanent, not just-this-exact-string blocks, so fall back
	// to an anonymized base instead of suffix-looping forever.
	let base = slugify(name);
	if (!base || /^[0-9-]+$/.test(base) || /(^|-)admin($|-)/.test(base)) base = `leader-${randomUUID().slice(0, 8)}`;
	let candidate = base;
	let n = 1;
	// Hard cap: this loop should resolve in 1-2 iterations in practice — bounding it
	// turns any unforeseen isSlugAvailable bug into a clear error instead of a hang.
	for (let tries = 0; tries < 100; tries++) {
		if (await isSlugAvailable(candidate)) {
			return candidate;
		}
		n++;
		candidate = `${base}-${n}`;
	}
	throw new Error(`Could not find a free slug for "${name}" after 100 attempts.`);
}

export type LeaderContext = {
	// The held term the dashboard anchors to, if any. NULL for a pure aspirant who has
	// only a run (campaign) and no leaders row — held-office-only ops guard on this.
	leader: typeof leaders.$inferSelect | null;
	// The lead seat (from the held term or the run). NULL for a fresh application
	// whose Campaign tab (seat + cycle) hasn't been saved yet — seat-scoped pages guard.
	position: typeof positions.$inferSelect | null;
	campaignId: number; // the person's run this cycle (0 if none) — manifesto/fundraising/verification target it
	verified: boolean; // publicly live: a verified held term OR a verified run
	profileUser: typeof users.$inferSelect; // the person the leader page is about
	role: 'leader' | 'manager';
};

/** Builds a dashboard context for a person: their lead held term (if any) + their run
 * this cycle. With `allowEmpty` (URL-named or managed profiles) a person with neither
 * still resolves — a fresh application declares its seat later, on the Campaign tab.
 * Without it (the viewer's own fallback) null keeps plain citizens on the citizen view. */
async function buildContext(
	profileUser: typeof users.$inferSelect,
	role: 'leader' | 'manager',
	allowEmpty = false
): Promise<LeaderContext | null> {
	const terms = await db
		.select()
		.from(leaders)
		.innerJoin(positions, eq(leaders.positionId, positions.id))
		.where(and(eq(leaders.userId, profileUser.id), isNull(leaders.deletedAt)));
	const term =
		terms.find((t) => t.leaders.status !== 'former') ??
		terms.toSorted((a, b) => b.leaders.startAt.getTime() - a.leaders.startAt.getTime())[0] ??
		null;

	const [run] = await db
		.select()
		.from(campaigns)
		.innerJoin(positions, eq(campaigns.positionId, positions.id))
		.where(and(eq(campaigns.subjectUserId, profileUser.id), eq(campaigns.cycleYear, ACTIVE_CYCLE), isNull(campaigns.parentCampaignId), isNull(campaigns.deletedAt)));

	const position = term?.positions ?? run?.positions ?? null;
	if (!position && !allowEmpty) return null; // neither a held term nor a run

	return {
		leader: term?.leaders ?? null,
		position,
		campaignId: run?.campaigns.id ?? 0,
		verified: !!term?.leaders.verifiedAt || !!run?.campaigns.verifiedAt,
		profileUser,
		role
	};
}

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
	// Their own profile (person = them) if any.
	const [own] = await db.select().from(users).where(and(eq(users.id, domainUserId), isNull(users.deletedAt)));
	if (own) {
		const ownCtx = await buildContext(own, 'leader');
		if (ownCtx) return ownCtx;
	}

	// Otherwise the person they most recently began managing (managers attach to the person).
	const [managed] = await db
		.select({ users })
		.from(managers)
		.innerJoin(users, eq(managers.subjectUserId, users.id))
		.where(and(eq(managers.userId, domainUserId), eq(managers.isActive, true), isNull(managers.deletedAt), isNull(users.deletedAt)))
		.orderBy(desc(managers.id))
		.limit(1);
	if (managed) return buildContext(managed.users, 'manager', true);

	return null;
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

/** Whether this account is a platform admin (users.adminAt set). Platform admins may
 * open any leader's dashboard, so the context resolvers bypass the manager check for them. */
export async function isPlatformAdmin(domainUserId: number): Promise<boolean> {
	const [row] = await db.select({ adminAt: users.adminAt }).from(users).where(eq(users.id, domainUserId));
	return !!row?.adminAt;
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
 * The leader context for an explicit /dashboard/[slug]/* URL — the URL, not
 * guesswork, picks which campaign is active (a person can manage several).
 * Returns null when the slug doesn't resolve or the viewer has no access
 * (not the leader's own profile and not an active manager of it).
 */
export async function getLeaderContextBySlug(slug: string, domainUserId: number): Promise<LeaderContext | null> {
	const [profileUser] = await db.select().from(users).where(eq(users.slug, slug));
	if (!profileUser) return null;

	const admin = await isPlatformAdmin(domainUserId);
	// A deactivated profile (users.deletedAt) is off-limits to its own team — only a
	// platform admin can still open it, since Activate (the only way back out of
	// Deactivate) lives on this same dashboard route.
	if (profileUser.deletedAt && !admin) return null;

	const role: 'leader' | 'manager' = profileUser.id === domainUserId ? 'leader' : 'manager';
	// A platform admin may open any leader's dashboard; everyone else needs to be the
	// leader or an active manager of them.
	if (role === 'manager' && !(await findPersonManager(domainUserId, profileUser.id)) && !admin) return null;

	return await buildContext(profileUser, role, true);
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
	// Person-first: a slug is a PERSON's URL, and a pure aspirant has no leaders row
	// at all — only a run (campaign). So resolve the user, then their held terms and
	// their active run separately.
	const [userRow] = await db.select().from(users).where(and(eq(users.slug, slug), isNull(users.deletedAt)));
	if (!userRow) return null;
	return resolveTermForUser(userRow);
}

/** Same resolution as resolveCurrentTerm, but keyed by the person's user id — for
 * slugless previews (a not-yet-verified application has no slug until approval,
 * so /previews/[userId] resolves by id instead of a public URL). */
export async function resolveCurrentTermByUserId(userId: number) {
	const [userRow] = await db.select().from(users).where(and(eq(users.id, userId), isNull(users.deletedAt)));
	if (!userRow) return null;
	return resolveTermForUser(userRow);
}

async function resolveTermForUser(userRow: typeof users.$inferSelect) {
	const row = { users: userRow };

	const terms = await db
		.select()
		.from(leaders)
		.innerJoin(positions, eq(leaders.positionId, positions.id))
		.where(and(eq(leaders.userId, userRow.id), isNull(leaders.deletedAt)));

	// The leaders term the profile leads with: a live (non-former) term, else the most
	// recent past one. Null for a person who has only ever run, never held office.
	const currentTerm =
		terms.find((t) => t.leaders.status !== 'former') ??
		terms.toSorted((a, b) => b.leaders.startAt.getTime() - a.leaders.startAt.getTime())[0] ??
		null;

	// The person's active RUN (main campaign + its seat), latest cycle first — how
	// an aspirant with no leaders row becomes public. verifiedAt no longer gates
	// visibility (every account is public; it's a "Verified" badge only), so this
	// is just their most recent cycle's run. Null when they aren't running.
	const runs = await db
		.select()
		.from(campaigns)
		.innerJoin(positions, eq(campaigns.positionId, positions.id))
		.where(and(eq(campaigns.subjectUserId, userRow.id), isNull(campaigns.parentCampaignId), isNull(campaigns.deletedAt)))
		.orderBy(desc(campaigns.cycleYear));
	const activeRun = runs[0] ?? null;

	return { row, terms, currentTerm, activeRun };
}

/** All leaders (joined to person + seat) for one position/region pair, not
 * deactivated. verifiedAt is a badge only, not a visibility gate. Resolves the seat first
 * (positions is small and mostly static) so the leaders query is scoped to that
 * ONE seat's positionId in SQL, instead of scanning every leader nationwide. */
export async function listLeadersForSeat(position: string, region: string) {
	const positionRow = await findPositionByPath(position, region);
	if (!positionRow) return [];

	return db
		.select()
		.from(leaders)
		.innerJoin(positions, eq(leaders.positionId, positions.id))
		.innerJoin(users, eq(leaders.userId, users.id))
		.where(and(eq(leaders.positionId, positionRow.id), isNull(leaders.deletedAt), isNull(users.deletedAt)));
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

	// A campaign is one run at one seat in one cycle — stamp both from its term,
	// and anchor it to the person holding the term (campaigns are person-scoped).
	const [term] = await db.select({ userId: leaders.userId, positionId: leaders.positionId, startAt: leaders.startAt }).from(leaders).where(eq(leaders.id, leaderId));
	const [created] = await db
		.insert(campaigns)
		.values({
			creatorId,
			subjectUserId: term.userId,
			leaderId,
			positionId: term.positionId,
			cycleYear: term.startAt.getFullYear(),
			title: `${leaderName}'s Campaign`,
			description: `${leaderName}'s campaign for office.`
		})
		.returning();
	return created;
}

/**
 * The person's run for the active cycle (their 2027 campaign) — what the dashboard
 * workspace (manifesto/fundraising) targets, since a run belongs to the person, not a
 * held term. Created lazily on first write; an incumbent editing their manifesto is
 * declaring/continuing their re-election run. `positionId` is the seat they're running
 * for (their lead seat). A newly created run is unverified (pending admin verification).
 */
export async function getOrCreateRunCampaign(subjectUserId: number, positionId: number, creatorId: number, name: string) {
	const existing = await getRunCampaign(subjectUserId);
	if (existing) return existing;
	const [created] = await db
		.insert(campaigns)
		.values({
			creatorId,
			subjectUserId,
			leaderId: null,
			positionId,
			cycleYear: ACTIVE_CYCLE,
			title: `${name}'s Campaign`,
			description: `${name}'s campaign for office.`
		})
		.returning();
	return created;
}

/** Read-only: the person's active-cycle run (2027 main campaign), or null if none yet. */
/** Resolves the "Other" party option to a real parties.id — reuses an existing row
 * (case-insensitive exact match) so retyping the same unregistered party's name
 * doesn't fork into duplicate rows, else creates one. status='unregistered' marks
 * it as never having gone through the ORPP register (distinct from 'provisional',
 * which IS an ORPP registration stage). */
export async function resolveOtherParty(name: string): Promise<number> {
	const trimmed = name.trim();
	const [existing] = await db
		.select({ id: parties.id })
		.from(parties)
		.where(and(ilike(parties.name, trimmed), isNull(parties.deletedAt)));
	if (existing) return existing.id;
	const [created] = await db.insert(parties).values({ name: trimmed, status: 'unregistered' }).returning({ id: parties.id });
	return created.id;
}

export async function getRunCampaign(subjectUserId: number) {
	const [c] = await db
		.select()
		.from(campaigns)
		.where(and(eq(campaigns.subjectUserId, subjectUserId), eq(campaigns.cycleYear, ACTIVE_CYCLE), isNull(campaigns.parentCampaignId), isNull(campaigns.deletedAt)));
	return c ?? null;
}

/** Finds a DIFFERENT account whose sign-off is already complete (role + national ID +
 * both ID images) with the same national ID, if any — not a hard block (could be a
 * genuine duplicate account for the same person), just a flag surfaced on the admin
 * verification/claim preview so an admin can decide. Not narrowed by SQL predicate on
 * the jsonb `roles` column (see team/+page.server.ts's removeManager for the same
 * convention) — filtered in JS instead. */
export async function findNationalIdConflict(
	nationalId: string,
	excludeUserId: number
): Promise<{ id: number; name: string; email: string; phone: string | null } | null> {
	const rows = await db
		.select({
			userId: managers.userId,
			roles: managers.roles,
			firstName: users.firstName,
			otherNames: users.otherNames,
			idFrontUrl: users.idFrontUrl,
			idBackUrl: users.idBackUrl,
			email: authUsers.email
		})
		.from(managers)
		.innerJoin(users, eq(managers.userId, users.id))
		.innerJoin(authUsers, eq(users.authUserId, authUsers.id))
		.where(isNull(managers.deletedAt));
	const conflict = rows.find(
		(r) =>
			r.userId !== excludeUserId &&
			(r.roles as { nationalId?: string } | null)?.nationalId === nationalId &&
			signoffComplete(r.roles as ManagerRoles, r)
	);
	if (!conflict) return null;

	const [phoneRow] = await db
		.select({ value: contacts.value })
		.from(contacts)
		.where(and(eq(contacts.userId, conflict.userId), eq(contacts.channel, 'sms'), isNull(contacts.deletedAt)));
	return { id: conflict.userId, name: fullName(conflict), email: conflict.email, phone: phoneRow?.value ?? null };
}
