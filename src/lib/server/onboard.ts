// The "Create Your Profile" onboarding wizard (User Flows v2, step 3) — the single
// entry every leader/aspirant/manager takes. The name fields feed the live Profile
// Matcher (RHS); on submit the citizen either LINKS an existing seeded profile (a
// claim) or CREATES a fresh one, then moves on to /onboard/plan.
//
// Deliberate simplifications for this step (see the flowcharts doc):
//  - No leaders/campaigns row is written here at all — a fresh create is name +
//    role only. Leadership status, seats, parties, and a run are all filled in
//    later on the dashboard's own Profile/Campaign tabs, at zero friction before
//    payment (see docs/URLDiscovery.md "onboarding friction" note).
//  - The slug is minted at creation, not admin approval — the page can be paid for and
//    published without an admin in the loop.
import { and, eq, ilike, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, leaders, managers, parties, positions, profileClaims, users } from '$lib/server/db/schema';
import { ACTIVE_CYCLE, createPhantomUser, fullName, generateLeaderSlug, leaderPath } from '$lib/server/leader';
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

export type OnboardInput = {
	firstName: string;
	otherNames: string;
	myRole: string;
};

// Raw strings as they travel through form fields / query params — validated once
// on step 3 submit (fast feedback) and again at checkout's Pay action (the values
// ride in a client-visible URL the whole way there, so re-validating before writing
// anything to the database is defense-in-depth, not just belt-and-braces).
export type OnboardRawInput = {
	firstName: string;
	otherNames: string;
	myRole: string;
};

export function validateOnboardInput(raw: OnboardRawInput): { ok: true; input: OnboardInput } | { ok: false; error: string } {
	const firstName = raw.firstName.trim();
	const otherNames = raw.otherNames.trim();
	const myRole = raw.myRole.trim();

	if (!firstName || /\s/.test(firstName)) return { ok: false, error: 'First name is required and must be a single word.' };
	if (!otherNames) return { ok: false, error: 'Other names are required.' };
	if (!myRole || !(CAMPAIGN_ROLES as readonly string[]).includes(myRole)) return { ok: false, error: 'Choose your role.' };

	return { ok: true, input: { firstName, otherNames, myRole } };
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

/** No matching profile — mint a brand-new one the citizen owns (source=applied). Returns
 * the new profile's slug so the wizard can carry it into plans/checkout. Name + role
 * only — no leaders/campaigns row here at all; the owner fills in leadership status,
 * seat, party, and a run later on the dashboard's own Profile/Campaign tabs. */
export async function createProfile(domainUserId: number, input: OnboardInput): Promise<{ slug: string; subjectUserId: number }> {
	const phantom = await createPhantomUser(input.firstName, input.otherNames);
	const slug = await generateLeaderSlug(fullName({ firstName: input.firstName, otherNames: input.otherNames }));
	await db.update(users).set({ slug }).where(eq(users.id, phantom.id));

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
 * source=claimed) by granting them admin manager access. Returns the profile's slug. */
export async function linkProfile(domainUserId: number, input: OnboardInput, subjectUserId: number): Promise<{ slug: string; subjectUserId: number }> {
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
