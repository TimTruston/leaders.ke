// The "Create Your Profile" onboarding wizard (User Flows v2, step 3) — the single
// entry every leader/aspirant/manager takes. The name fields feed the live Profile
// Matcher (RHS); on submit the citizen either LINKS an existing seeded profile (a
// claim) or CREATES a fresh one, then moves on to /onboard/plan. The status
// checkboxes (existing/former/candidate) aren't mutually exclusive — a former
// leader can also be a current candidate — so each carries its own seat (+ years).
//
// Deliberate simplifications for this step (see the flowcharts doc):
//  - Only a FRESH create writes real rows (createProfile): Former leader becomes a
//    real Track Record entry (leaders, status='former') and Candidate becomes the
//    real 2027 run (campaigns), both written once payment succeeds. A claim
//    (linkProfile) never writes either — the seeded profile already has its own
//    real history, so onboarding's guess would only risk duplicating it; there the
//    checked boxes stay matcher hints (bio + profileClaims.evidence) only.
//  - The slug is minted at creation, not admin approval — the page can be paid for and
//    published without an admin in the loop.
import { and, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, leaders, managers, parties, positions, profileClaims, users } from '$lib/server/db/schema';
import { ACTIVE_CYCLE, createPhantomUser, fullName, generateLeaderSlug, getOrCreateRunCampaign, leaderPath, resolveOtherParty } from '$lib/server/leader';
import { CAMPAIGN_ROLES } from '$lib/utils/campaignRoles';
import { notifyUser } from '$lib/server/notifications';

/** Every platform admin's user id — shared by the two admin-notification helpers below. */
async function listAdminIds(): Promise<number[]> {
	const rows = await db.select({ id: users.id }).from(users).where(and(isNotNull(users.adminAt), isNull(users.deletedAt)));
	return rows.map((r) => r.id);
}

export type MatchingProfile = {
	subjectUserId: number;
	name: string;
	initials: string;
	slug: string;
	photoUrl: string | null;
	party: string | null;
	positionTitle: string;
	region: string;
	status: string;
	previewPath: string; // opens the public /[slug] page in a new tab
};

const initialsOf = (name: string) =>
	name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

/**
 * Relevance of a candidate to the typed name — higher is better. A part is any
 * whitespace-separated word the citizen typed; the person's name is their first +
 * other names. Full-name matches ("Timothy" + "Bosire" -> "Timothy Bosire") must
 * outrank a single shared word, and a prefix ("Tim" -> "Timothy") beats a mid-word
 * substring. Returns 0 when a typed part matches nowhere, so unrelated rows drop out.
 */
function matchScore(firstName: string, otherNames: string, parts: string[]): number {
	const words = `${firstName} ${otherNames}`.toLowerCase().split(/\s+/).filter(Boolean);
	let total = 0;
	for (const raw of parts) {
		const p = raw.toLowerCase();
		let best = 0;
		for (const w of words) {
			if (w === p) best = Math.max(best, 100);
			else if (w.startsWith(p)) best = Math.max(best, 70);
			else if (w.includes(p)) best = Math.max(best, 35);
		}
		if (best === 0) return 0; // every typed part must land somewhere
		total += best;
	}
	// Bonus when the typed words appear in the same order as the name reads.
	if (`${firstName} ${otherNames}`.toLowerCase().includes(parts.map((p) => p.toLowerCase()).join(' '))) total += 40;
	return total;
}

/**
 * Public, claimable profiles whose name matches what the citizen typed, ranked most
 * relevant first — the Profile Matcher cards. "Claimable" = a real seeded/public
 * person (has a slug) with no active manager yet; an already-owned profile never
 * appears. Every typed word must appear somewhere in the person's name, so a full
 * match ("Tim" + "Bosire") lands "Timothy Bosire" at the top rather than every "Tim".
 */
export async function findMatchingProfiles(firstName: string, otherNames: string): Promise<MatchingProfile[]> {
	const parts = [firstName, otherNames].flatMap((s) => s.trim().split(/\s+/)).filter(Boolean);
	if (parts.length === 0) return [];

	// Each typed word must appear in either name column (AND across words), so the
	// candidate set is already the "all words present" set — the strongest matches.
	// If nothing matches every word (e.g. only a first name typed that's shared widely),
	// fall back to any-word matches so the panel isn't empty.
	const perPart = parts.map((p) => or(ilike(users.firstName, `%${p}%`), ilike(users.otherNames, `%${p}%`)));
	const select = () => db.select({ id: users.id, firstName: users.firstName, otherNames: users.otherNames, slug: users.slug, photoUrl: users.photoUrl }).from(users);
	let candidates = await select().where(and(isNull(users.deletedAt), ...perPart)).limit(40);
	if (candidates.length === 0 && parts.length > 1) {
		candidates = await select().where(and(isNull(users.deletedAt), or(...perPart))).limit(40);
	}

	const withSlug = candidates.filter((c) => c.slug && matchScore(c.firstName, c.otherNames, parts) > 0);
	if (withSlug.length === 0) return [];
	const ids = withSlug.map((c) => c.id);

	// Drop anyone already owned (an active manager means applied/claimed already).
	const managed = await db
		.select({ subjectUserId: managers.subjectUserId })
		.from(managers)
		.where(and(inArray(managers.subjectUserId, ids), eq(managers.isActive, true), isNull(managers.deletedAt)));
	const ownedIds = new Set(managed.map((m) => m.subjectUserId));

	// Lead seat + its party per person: a held non-former term beats a former one,
	// beats an active-cycle run (bulk, no N+1). Party is per-term/per-run, not a
	// person-level fact — this picks whichever row IS the lead seat's own party.
	const [termRows, runRows] = await Promise.all([
		db
			.select({ userId: leaders.userId, status: leaders.status, title: positions.title, region: positions.region, partyId: leaders.partyId })
			.from(leaders)
			.innerJoin(positions, eq(leaders.positionId, positions.id))
			.where(and(inArray(leaders.userId, ids), isNull(leaders.deletedAt))),
		db
			.select({ userId: campaigns.subjectUserId, title: positions.title, region: positions.region, partyId: campaigns.partyId })
			.from(campaigns)
			.innerJoin(positions, eq(campaigns.positionId, positions.id))
			.where(and(inArray(campaigns.subjectUserId, ids), eq(campaigns.cycleYear, ACTIVE_CYCLE), isNull(campaigns.parentCampaignId), isNull(campaigns.deletedAt)))
	]);
	const seatBySubject = new Map<number, { title: string; region: string; status: string; partyId: number | null }>();
	for (const t of termRows) {
		const held = seatBySubject.get(t.userId);
		if (!held || (held.status === 'former' && t.status !== 'former')) {
			seatBySubject.set(t.userId, { title: t.title, region: t.region, status: t.status, partyId: t.partyId });
		}
	}
	for (const r of runRows) {
		const held = seatBySubject.get(r.userId);
		if (!held || held.status === 'former') {
			seatBySubject.set(r.userId, { title: r.title, region: r.region, status: 'aspirant', partyId: r.partyId });
		}
	}

	const partyIds = [...new Set([...seatBySubject.values()].map((s) => s.partyId).filter((id): id is number => id !== null))];
	const partyRows = partyIds.length
		? await db.select({ id: parties.id, name: parties.name, abbreviation: parties.abbreviation }).from(parties).where(inArray(parties.id, partyIds))
		: [];
	const partyNameById = new Map(partyRows.map((p) => [p.id, p.abbreviation ? `${p.name} (${p.abbreviation})` : p.name]));

	return withSlug
		.filter((c) => !ownedIds.has(c.id))
		.map((c) => {
			const name = fullName(c);
			const seat = seatBySubject.get(c.id);
			return {
				subjectUserId: c.id,
				name,
				initials: initialsOf(name),
				slug: c.slug!,
				photoUrl: c.photoUrl,
				party: seat?.partyId ? (partyNameById.get(seat.partyId) ?? null) : null,
				positionTitle: seat?.title ?? '',
				region: seat?.region ?? '',
				status: seat?.status ?? 'aspirant',
				previewPath: leaderPath({ slug: c.slug! }),
				score: matchScore(c.firstName, c.otherNames, parts)
			};
		})
		// Best match first; a held/current seat nudges ahead of an aspirant on a tie
		// (more likely to be who the citizen means).
		.sort((a, b) => b.score - a.score || Number(b.status !== 'aspirant') - Number(a.status !== 'aspirant'))
		.slice(0, 12)
		.map(({ score: _score, ...rest }) => rest);
}

// A citizen can check more than one box at once (e.g. a former Governor now
// running for Senate) — each box is independent, carrying only the fields its
// own status needs, not a single exclusive "status" choice.
export type OnboardCurrent = { positionId: number; partyId: number | null; partyOther: string | null };
export type OnboardFormer = { positionId: number; fromYear: number; toYear: number; partyId: number | null; partyOther: string | null };
export type OnboardAspirant = { positionId: number; year: number; partyId: number | null; partyOther: string | null };

export type OnboardInput = {
	firstName: string;
	otherNames: string;
	myRole: string;
	current: OnboardCurrent | null;
	former: OnboardFormer | null;
	aspirant: OnboardAspirant | null;
};

// Raw strings as they travel through form fields / query params — validated once
// on step 3 submit (fast feedback) and again at checkout's Pay action (the values
// ride in a client-visible URL the whole way there, so re-validating before writing
// anything to the database is defense-in-depth, not just belt-and-braces).
export type OnboardRawInput = {
	firstName: string;
	otherNames: string;
	myRole: string;
	currentChecked: string;
	currentPositionId: string;
	currentPartyId: string;
	currentPartyOther: string;
	formerChecked: string;
	formerPositionId: string;
	formerFromYear: string;
	formerToYear: string;
	formerPartyId: string;
	formerPartyOther: string;
	aspirantChecked: string;
	aspirantPositionId: string;
	aspirantYear: string;
	aspirantPartyId: string;
	aspirantPartyOther: string;
};

const MIN_YEAR = 1963; // Kenyan independence — no term/run predates it
const MAX_YEAR = ACTIVE_CYCLE + 20; // generous headroom for a future cycle

function validYear(raw: string): number | null {
	const year = Number(raw);
	return Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR ? year : null;
}

// '' = independent, 'other' = free-text name (resolved into a real party row later,
// at actual creation time — never here, so a step-3 submit that never reaches
// payment doesn't litter the parties table), else an existing party's id.
function parseParty(partyRaw: string, partyOtherRaw: string): { ok: true; partyId: number | null; partyOther: string | null } | { ok: false; error: string } {
	if (partyRaw === 'other') {
		const trimmed = partyOtherRaw.trim();
		if (!trimmed) return { ok: false, error: 'Enter the party name.' };
		return { ok: true, partyId: null, partyOther: trimmed };
	}
	return { ok: true, partyId: partyRaw ? Number(partyRaw) || null : null, partyOther: null };
}

export function validateOnboardInput(raw: OnboardRawInput): { ok: true; input: OnboardInput } | { ok: false; error: string } {
	const firstName = raw.firstName.trim();
	const otherNames = raw.otherNames.trim();
	const myRole = raw.myRole.trim();

	if (!firstName || /\s/.test(firstName)) return { ok: false, error: 'First name is required and must be a single word.' };
	if (!otherNames) return { ok: false, error: 'Other names are required.' };
	if (!myRole || !(CAMPAIGN_ROLES as readonly string[]).includes(myRole)) return { ok: false, error: 'Choose your role.' };

	let current: OnboardCurrent | null = null;
	if (raw.currentChecked === 'on') {
		const positionId = Number(raw.currentPositionId) || null;
		if (!positionId) return { ok: false, error: 'Choose the current leadership position.' };
		const party = parseParty(raw.currentPartyId, raw.currentPartyOther);
		if (!party.ok) return party;
		current = { positionId, partyId: party.partyId, partyOther: party.partyOther };
	}

	let former: OnboardFormer | null = null;
	if (raw.formerChecked === 'on') {
		const positionId = Number(raw.formerPositionId) || null;
		if (!positionId) return { ok: false, error: 'Choose the former leadership position.' };
		const fromYear = validYear(raw.formerFromYear);
		const toYear = validYear(raw.formerToYear);
		if (!fromYear || !toYear) return { ok: false, error: 'Enter valid from/to years for the former position.' };
		if (toYear < fromYear) return { ok: false, error: 'The "to" year can\'t be before the "from" year.' };
		const party = parseParty(raw.formerPartyId, raw.formerPartyOther);
		if (!party.ok) return party;
		former = { positionId, fromYear, toYear, partyId: party.partyId, partyOther: party.partyOther };
	}

	let aspirant: OnboardAspirant | null = null;
	if (raw.aspirantChecked === 'on') {
		const positionId = Number(raw.aspirantPositionId) || null;
		if (!positionId) return { ok: false, error: 'Choose the leadership position being contested.' };
		const year = validYear(raw.aspirantYear);
		if (!year) return { ok: false, error: 'Enter a valid election year.' };
		const party = parseParty(raw.aspirantPartyId, raw.aspirantPartyOther);
		if (!party.ok) return party;
		aspirant = { positionId, year, partyId: party.partyId, partyOther: party.partyOther };
	}

	if (!current && !former && !aspirant) return { ok: false, error: 'Check at least one: existing leader, former leader, or candidate.' };

	return { ok: true, input: { firstName, otherNames, myRole, current, former, aspirant } };
}

/** Whether a seeded profile is still linkable — has a slug and no active manager.
 * Checked once for fast feedback on step 3 submit, and again (authoritatively,
 * inside a would-be race) by linkProfile itself at payment time — nothing is
 * granted access until then, so this can go stale between the two checks. */
export async function assertClaimable(subjectUserId: number): Promise<{ ok: true } | { ok: false; error: string }> {
	const [subject] = await db.select({ id: users.id, slug: users.slug }).from(users).where(and(eq(users.id, subjectUserId), isNull(users.deletedAt)));
	if (!subject?.slug) return { ok: false, error: 'That profile is not available to link.' };
	const [owner] = await db
		.select({ id: managers.id })
		.from(managers)
		.where(and(eq(managers.subjectUserId, subjectUserId), eq(managers.isActive, true), isNull(managers.deletedAt)));
	if (owner) return { ok: false, error: 'That profile has just been claimed by someone else.' };
	return { ok: true };
}

/** Which declared seat leads the whole flow, when more than one box is checked:
 * the seat being run for beats the one currently held beats one held in the past —
 * the plan/price this wizard sells is for the 2027 RUN, so that's what should drive
 * Plan's office display and Checkout's price/label if it's present at all. */
export function leadPositionId(seats: { aspirantPositionId?: number | null; currentPositionId?: number | null; formerPositionId?: number | null }): number | null {
	return seats.aspirantPositionId || seats.currentPositionId || seats.formerPositionId || null;
}

/** A seat's display label ("President, Kenya") + its price band — null if the
 * position no longer exists. Batches every id needed at once (bioHint may need up
 * to three) rather than one query per lookup. */
export async function getSeatInfo(positionIds: number[]): Promise<Map<number, { label: string; band: string }>> {
	if (positionIds.length === 0) return new Map();
	const rows = await db.select({ id: positions.id, title: positions.title, region: positions.region, band: positions.band }).from(positions).where(inArray(positions.id, positionIds));
	return new Map(rows.map((p) => [p.id, { label: `${p.title}, ${p.region}`, band: p.band }]));
}

/** Resolves each block's "other" party name into a real party row — once, here, at
 * actual creation time (never in validateOnboardInput, which runs on every step-3
 * submit whether or not the citizen ever pays). Safe to call from both createProfile
 * and linkProfile: resolveOtherParty matches an existing party by name first. */
async function resolveInputParties(input: OnboardInput): Promise<OnboardInput> {
	const resolve = async <T extends { partyId: number | null; partyOther: string | null }>(block: T | null): Promise<T | null> =>
		block ? { ...block, partyId: block.partyOther ? await resolveOtherParty(block.partyOther) : block.partyId, partyOther: null } : null;
	return { ...input, current: await resolve(input.current), former: await resolve(input.former), aspirant: await resolve(input.aspirant) };
}

/** The status(es) + seat(s) the citizen declared, kept on the new profile's bio as a
 * matcher hint (bio is not public before payment and the owner replaces it on the
 * profile tab). A person can carry more than one — e.g. a former Governor now
 * running for Senate — so this joins whichever boxes were checked. Call AFTER
 * resolveInputParties so partyId is a real row, not a pending "other" name. */
async function bioHint(input: OnboardInput): Promise<string> {
	const positionIds = [input.current?.positionId, input.former?.positionId, input.aspirant?.positionId].filter((id): id is number => !!id);
	const partyIds = [input.current?.partyId, input.former?.partyId, input.aspirant?.partyId].filter((id): id is number => !!id);
	const [seats, partyRows] = await Promise.all([
		getSeatInfo(positionIds),
		partyIds.length ? db.select({ id: parties.id, name: parties.name }).from(parties).where(inArray(parties.id, partyIds)) : Promise.resolve([])
	]);
	const partyNameById = new Map(partyRows.map((p) => [p.id, p.name]));
	const partySuffix = (partyId: number | null) => (partyId && partyNameById.has(partyId) ? ` · ${partyNameById.get(partyId)}` : '');

	const parts: string[] = [];
	if (input.current) parts.push(`Current leader — ${seats.get(input.current.positionId)?.label ?? ''}${partySuffix(input.current.partyId)}`);
	if (input.former) parts.push(`Former leader — ${seats.get(input.former.positionId)?.label ?? ''} (${input.former.fromYear}–${input.former.toYear})${partySuffix(input.former.partyId)}`);
	if (input.aspirant) parts.push(`Candidate — ${seats.get(input.aspirant.positionId)?.label ?? ''} (${input.aspirant.year})${partySuffix(input.aspirant.partyId)}`);
	return parts.join(' · ');
}

/** A citizen's "Existing leader" or "Former leader" claim collided with an
 * already-seeded holder of the same seat (current: only one holder at a time,
 * platform-wide; former: two people's stated years overlap) — createProfile
 * doesn't write the row either way (never bump/replace a real leader's record
 * automatically), so this is admins' only signal the claim exists and needs a
 * human to decide which one is right. Includes the claimed party since that part
 * of the claim isn't itself in conflict — only the seat/time is. */
async function notifyAdminsOfLeaderConflict(opts: {
	subjectUserId: number;
	subjectSlug: string;
	positionId: number;
	incumbentUserId: number;
	partyId: number | null;
	claimLabel: string; // e.g. "currently holds" or "held from 2013 to 2017"
	recordedLabel: string; // e.g. "already recorded under" or "overlaps a record already held by"
}) {
	const [subject] = await db.select({ firstName: users.firstName, otherNames: users.otherNames }).from(users).where(eq(users.id, opts.subjectUserId));
	const [incumbent] = await db.select({ firstName: users.firstName, otherNames: users.otherNames, slug: users.slug }).from(users).where(eq(users.id, opts.incumbentUserId));
	const [position] = await db.select({ title: positions.title, region: positions.region }).from(positions).where(eq(positions.id, opts.positionId));
	const [party] = opts.partyId ? await db.select({ name: parties.name }).from(parties).where(eq(parties.id, opts.partyId)) : [];
	const adminIds = await listAdminIds();

	const subjectName = subject ? fullName(subject) : 'A new profile';
	const incumbentName = incumbent ? fullName(incumbent) : 'the recorded incumbent';
	const seatLabel = position ? `${position.title}, ${position.region}` : 'a seat';
	const incumbentLink = incumbent?.slug ? `\n<a href="/${incumbent.slug}">Click here to view the recorded incumbent</a>` : '';
	const partySuffix = party ? ` (claimed party: ${party.name})` : '';

	await Promise.all(
		adminIds.map((adminId) =>
			notifyUser(adminId, {
				kind: 'claim',
				title: 'Conflicting leader claim',
				body: `${subjectName} claims to have ${opts.claimLabel} ${seatLabel}${partySuffix}, which ${opts.recordedLabel} ${incumbentName}. Review and reassign if the new claim is correct.\n<a href="/${opts.subjectSlug}">Click here to view the new profile</a>${incumbentLink}`,
				href: `/dashboard/${opts.subjectSlug}/profile`,
				linkLabel: 'Click here to open the new profile'
			})
		)
	);
}

/** No matching profile — mint a brand-new one the citizen owns (source=applied). Returns
 * the new profile's slug so the wizard can carry it into plans/checkout. */
export async function createProfile(domainUserId: number, rawInput: OnboardInput): Promise<{ slug: string; subjectUserId: number }> {
	const input = await resolveInputParties(rawInput);
	const phantom = await createPhantomUser(input.firstName, input.otherNames);
	const slug = await generateLeaderSlug(fullName({ firstName: input.firstName, otherNames: input.otherNames }));
	await db.update(users).set({ slug, bio: await bioHint(input) }).where(eq(users.id, phantom.id));

	// Existing leader -> the real ACTIVE term (status 'current'), not just a bio hint.
	// This has to exist whenever Former is also checked: buildContext resolves the
	// dashboard's "current term" context to whichever leaders row isn't former, or —
	// with no such row — falls back to the most recent one regardless of status, so
	// a former-only row would otherwise get mistaken for the active term (wrong
	// party shown as "current", and it'd never appear as Track Record history since
	// that list excludes whatever resolves as the active term).
	if (input.current) {
		// Only one 'current' leader per seat, platform-wide (one_current_per_position)
		// — if a sitting incumbent is already on record there, this citizen's claim
		// conflicts with it and can't be auto-resolved (could be a stale seed row, or
		// the citizen could be wrong); falls back to the bio hint (same as before)
		// plus an admin notification, rather than a payment-time 500 or silently
		// bumping the recorded incumbent.
		const [incumbent] = await db.select({ id: leaders.id, userId: leaders.userId }).from(leaders).where(and(eq(leaders.positionId, input.current.positionId), eq(leaders.status, 'current'), isNull(leaders.deletedAt)));
		if (!incumbent) {
			await db.insert(leaders).values({
				userId: phantom.id,
				positionId: input.current.positionId,
				partyId: input.current.partyId,
				status: 'current',
				startAt: new Date()
			});
		} else {
			// No real row, but the Profile tab still needs to show what the citizen
			// claimed (party especially) rather than silently dropping it — parked here
			// until an admin resolves the conflict one way or the other.
			await db.update(users).set({ pendingCurrentPositionId: input.current.positionId, pendingCurrentPartyId: input.current.partyId }).where(eq(users.id, phantom.id));
			await notifyAdminsOfLeaderConflict({
				subjectUserId: phantom.id,
				subjectSlug: slug,
				positionId: input.current.positionId,
				incumbentUserId: incumbent.userId,
				partyId: input.current.partyId,
				claimLabel: 'currently held',
				recordedLabel: 'is already recorded under'
			});
		}
	}

	// Former leader -> a real Track Record entry, the same shape the "+ Elected"
	// term editor writes (see the Profile tab's pendingLeadership handling). Two
	// different people can each genuinely have held a seat "former"ly at DIFFERENT
	// times, so only an OVERLAPPING year range is a real conflict — not just any
	// other former row at the same seat.
	if (input.former) {
		const overlap = await db
			.select({ id: leaders.id, userId: leaders.userId })
			.from(leaders)
			.where(
				and(
					eq(leaders.positionId, input.former.positionId),
					eq(leaders.status, 'former'),
					isNull(leaders.deletedAt),
					sql`extract(year from ${leaders.startAt}) <= ${input.former.toYear}`,
					sql`extract(year from coalesce(${leaders.endAt}, ${leaders.startAt})) >= ${input.former.fromYear}`
				)
			);
		if (overlap.length > 0) {
			await notifyAdminsOfLeaderConflict({
				subjectUserId: phantom.id,
				subjectSlug: slug,
				positionId: input.former.positionId,
				incumbentUserId: overlap[0].userId,
				partyId: input.former.partyId,
				claimLabel: `held from ${input.former.fromYear} to ${input.former.toYear}`,
				recordedLabel: 'overlaps a term already recorded under'
			});
		} else {
			await db.insert(leaders).values({
				userId: phantom.id,
				positionId: input.former.positionId,
				partyId: input.former.partyId,
				status: 'former',
				startAt: new Date(`${input.former.fromYear}-01-01T00:00:00+03:00`),
				endAt: new Date(`${input.former.toYear}-01-01T00:00:00+03:00`)
			});
		}
	}

	// Candidate -> the actual 2027 run, via the same lazy-create every dashboard
	// tab uses (getOrCreateRunCampaign) — cycleYear is always ACTIVE_CYCLE (2027),
	// same as everywhere else; the year the citizen typed is display-only (bioHint).
	if (input.aspirant) {
		const run = await getOrCreateRunCampaign(phantom.id, input.aspirant.positionId, domainUserId, fullName(input));
		if (input.aspirant.partyId) await db.update(campaigns).set({ partyId: input.aspirant.partyId }).where(eq(campaigns.id, run.id));
	}

	// The creator becomes the profile's first admin manager — the same shape the
	// Team tab and admin control bar read. National ID/sign-off isn't collected
	// here anymore; it's completed later on the Team tab, per manager.
	await db.insert(managers).values({
		userId: domainUserId,
		subjectUserId: phantom.id,
		roles: { admin: true, title: input.myRole || undefined }
	});

	return { slug, subjectUserId: phantom.id };
}

/** A matching profile was selected — link the citizen's account to it (a claim,
 * source=claimed) by granting them admin manager access. Returns the profile's slug.
 * Admin notification happens in checkout (see notifyAdminsOfNewProfile) — pricing
 * details belong in that email, and only checkout has them. */
export async function linkProfile(domainUserId: number, rawInput: OnboardInput, subjectUserId: number): Promise<{ slug: string; subjectUserId: number }> {
	const input = await resolveInputParties(rawInput);
	const [subject] = await db
		.select({ id: users.id, slug: users.slug, firstName: users.firstName, otherNames: users.otherNames })
		.from(users)
		.where(and(eq(users.id, subjectUserId), isNull(users.deletedAt)));
	if (!subject?.slug) throw new Error('That profile is not available to link.');

	// Guard the race: never link a profile that gained an owner since the matcher ran.
	const [owner] = await db
		.select({ id: managers.id })
		.from(managers)
		.where(and(eq(managers.subjectUserId, subjectUserId), eq(managers.isActive, true), isNull(managers.deletedAt)));
	if (owner) throw new Error('That profile has just been claimed by someone else.');

	await db.insert(managers).values({
		userId: domainUserId,
		subjectUserId,
		roles: { admin: true, title: input.myRole || undefined }
	});

	// Access is granted immediately (above), but this row is what gives admin
	// something to actually review afterwards: it shows up pending in the profile's
	// admin control bar (getProfileAdminMeta) until approved/rejected. Rejecting
	// (reviewClaim) deactivates the manager row just granted and restores the
	// profile from its seed record — there's no staged evidence here to apply on
	// approval like the old claim flow, access already happened at payment time.
	await db.insert(profileClaims).values({ subjectUserId, claimedBy: domainUserId, evidence: input });

	return { slug: subject.slug, subjectUserId };
}

/** Platform admins should know whenever a profile changes hands or gets created —
 * access (or the profile itself) already exists by the time this fires, so this is
 * purely their signal to go double-check it. Called from checkout's Pay action,
 * which is the only place that has the plan/price alongside the create/link result. */
export async function notifyAdminsOfNewProfile(opts: {
	kind: 'created' | 'claimed';
	actorUserId: number;
	subjectUserId: number;
	slug: string;
	tier: string;
	cycle: string;
	amount: number;
	subscriptionEndsAt: Date;
}) {
	const [subject] = await db.select({ firstName: users.firstName, otherNames: users.otherNames }).from(users).where(eq(users.id, opts.subjectUserId));
	const [actor] = await db.select({ firstName: users.firstName, otherNames: users.otherNames }).from(users).where(eq(users.id, opts.actorUserId));
	const adminIds = await listAdminIds();

	const profileName = subject ? fullName(subject) : 'A profile';
	const actorName = actor ? fullName(actor) : 'A citizen';
	const tierLabel = opts.tier.charAt(0).toUpperCase() + opts.tier.slice(1);
	const cycleLabel = opts.cycle.charAt(0).toUpperCase() + opts.cycle.slice(1);
	const amountLabel = new Intl.NumberFormat('en-KE').format(opts.amount);
	const endsAtLabel = opts.subscriptionEndsAt.toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' });

	await Promise.all(
		adminIds.map((adminId) =>
			notifyUser(adminId, {
				kind: 'claim',
				title: opts.kind === 'claimed' ? 'A profile was claimed' : 'A new profile was created',
				// href covers the Dashboard link (notifyUser appends it); Preview isn't
				// otherwise linked here, so it gets its own inline link (relative — notifyUser
				// rewrites it to an absolute URL for the emailed copy).
				body: `${actorName} ${opts.kind === 'claimed' ? 'claimed' : 'created'} ${profileName}'s profile — ${tierLabel} plan (${cycleLabel}), KES ${amountLabel} paid, runs until ${endsAtLabel}.\n<a href="/${opts.slug}">Click here to view the profile</a>`,
				href: `/dashboard/${opts.slug}/profile`,
				linkLabel: 'Click here to access the dashboard'
			})
		)
	);
}

/** Thanks the payer for their payment — same for a fresh create or a claim, since
 * either way they just paid for this plan on this profile. Called from checkout's
 * Pay action right alongside notifyAdminsOfNewProfile (only place with both the
 * plan/price and the create/link result). */
export async function notifyPayerOfPayment(opts: {
	payerUserId: number;
	subjectUserId: number;
	slug: string;
	tier: string;
	cycle: string;
	amount: number;
	subscriptionEndsAt: Date;
}) {
	const [subject] = await db.select({ firstName: users.firstName, otherNames: users.otherNames }).from(users).where(eq(users.id, opts.subjectUserId));
	const profileName = subject ? fullName(subject) : 'your profile';
	const tierLabel = opts.tier.charAt(0).toUpperCase() + opts.tier.slice(1);
	const cycleLabel = opts.cycle.charAt(0).toUpperCase() + opts.cycle.slice(1);
	const amountLabel = new Intl.NumberFormat('en-KE').format(opts.amount);
	const endsAtLabel = opts.subscriptionEndsAt.toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' });

	await notifyUser(opts.payerUserId, {
		kind: 'claim',
		title: 'Thanks for your payment',
		// href covers the dashboard link (notifyUser appends it as a "Click here…" link).
		body: `Thanks for your payment of KES ${amountLabel} for ${profileName}'s ${tierLabel} plan (${cycleLabel}). Your subscription runs until ${endsAtLabel}.`,
		href: `/dashboard/${opts.slug}/profile`,
		linkLabel: 'Click here to access your dashboard'
	});
}
