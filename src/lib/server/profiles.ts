// Admin "Profiles" tab: one row per leader PERSON, merging what used to be three
// separate tabs — candidates (held terms + runs), verifications (run review) and
// claims (profile ownership). A profile is any users row that has a leaders term
// or a 2027 run; citizens (accounts that only follow/mobilize) never appear.
//
// Derived columns the three old tabs each owned a piece of:
//   status   — aspirant | current | former   (the person's lead seat)
//   source   — seeded | applied | claimed     (how the profile came to exist)
//   verified — null | pending | approved | rejected | deleted  (review-workflow state)
import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, leaders, managers, positions, profileClaims, users, verifications } from '$lib/server/db/schema';
import { ACTIVE_CYCLE, fullName, leaderPath } from '$lib/server/leader';
import { seatPath } from '$lib/utils/seat';

export type ProfileSource = 'seeded' | 'applied' | 'claimed';
export type ProfileVerified = 'pending' | 'approved' | 'rejected' | 'deleted' | null;

export type ProfileRow = {
	profileId: number; // users.id of the person
	profileName: string;
	slug: string | null;
	status: 'aspirant' | 'current' | 'former';
	source: ProfileSource;
	verified: ProfileVerified;
	positionTitle: string;
	region: string;
	regionPath: string | null;
	// The controlling account (applicant or claimant), null for a seeded profile.
	managerName: string | null;
	managerId: number | null;
	// Where the "Admin" button lands (the leader's own dashboard) and whether a
	// campaign exists (gates the "Campaign ↗" action) + the run's cycle year.
	adminPath: string;
	profilePath: string; // public /[slug] or /previews/[id] when slugless
	campaignYear: number | null;
};

export type ProfilePage = { profiles: ProfileRow[]; total: number };

type Seat = { title: string; region: string; status: 'aspirant' | 'current' | 'former' };

/** Every leader profile, one row per person. Admin-only and a few thousand rows, so
 * (like the old candidates tab) it fetches in bulk, merges/searches/sorts in JS, then
 * paginates. `q` matches name, slug, and seat. */
export async function listProfiles(page: number, pageSize: number, opts: { q?: string } = {}): Promise<ProfilePage> {
	const [termRows, runRows] = await Promise.all([
		db
			.select({
				userId: leaders.userId,
				status: leaders.status,
				title: positions.title,
				region: positions.region
			})
			.from(leaders)
			.innerJoin(positions, eq(leaders.positionId, positions.id))
			.where(isNull(leaders.deletedAt)),
		db
			.select({
				userId: campaigns.subjectUserId,
				campaignId: campaigns.id,
				verifiedAt: campaigns.verifiedAt,
				title: positions.title,
				region: positions.region
			})
			.from(campaigns)
			.innerJoin(positions, eq(campaigns.positionId, positions.id))
			.where(and(eq(campaigns.cycleYear, ACTIVE_CYCLE), isNull(campaigns.parentCampaignId), isNull(campaigns.deletedAt)))
	]);

	// The full person set: anyone with a held term or a 2027 run.
	const personIds = [...new Set([...termRows.map((r) => r.userId), ...runRows.map((r) => r.userId)])];
	if (personIds.length === 0) return { profiles: [], total: 0 };

	const [personRows, managerRows, claimRows, verificationRows] = await Promise.all([
		db
			.select({ id: users.id, firstName: users.firstName, otherNames: users.otherNames, slug: users.slug, authUserId: users.authUserId, deletedAt: users.deletedAt })
			.from(users)
			.where(inArray(users.id, personIds)),
		db
			.select({ subjectUserId: managers.subjectUserId, userId: managers.userId, roles: managers.roles, firstName: users.firstName, otherNames: users.otherNames })
			.from(managers)
			.innerJoin(users, eq(managers.userId, users.id))
			.where(and(inArray(managers.subjectUserId, personIds), eq(managers.isActive, true), isNull(managers.deletedAt))),
		db
			.select({ subjectUserId: profileClaims.subjectUserId, outcome: profileClaims.outcome, requestedAt: profileClaims.requestedAt, deletedAt: profileClaims.deletedAt, claimantFirst: users.firstName, claimantOther: users.otherNames, claimedBy: profileClaims.claimedBy })
			.from(profileClaims)
			.innerJoin(users, eq(profileClaims.claimedBy, users.id))
			.where(inArray(profileClaims.subjectUserId, personIds))
			.orderBy(desc(profileClaims.requestedAt)),
		db
			.select({ campaignId: verifications.campaignId, outcome: verifications.outcome, requestedAt: verifications.requestedAt })
			.from(verifications)
			.orderBy(desc(verifications.requestedAt))
	]);

	const personById = new Map(personRows.map((p) => [p.id, p]));

	// Lead seat per person: a held non-former term beats a run beats a former term.
	const seatBySubject = new Map<number, Seat>();
	for (const t of termRows) {
		const held = seatBySubject.get(t.userId);
		if (!held || (held.status === 'former' && t.status !== 'former')) {
			seatBySubject.set(t.userId, { title: t.title, region: t.region, status: t.status as Seat['status'] });
		}
	}
	// Run (campaign) per person, keyed for the "Campaign ↗" action + aspirant seat.
	const runBySubject = new Map<number, (typeof runRows)[number]>();
	for (const r of runRows) if (!runBySubject.has(r.userId)) runBySubject.set(r.userId, r);
	for (const r of runRows) {
		const held = seatBySubject.get(r.userId);
		if (!held || held.status === 'former') seatBySubject.set(r.userId, { title: r.title, region: r.region, status: 'aspirant' });
	}

	// Controlling account: prefer an admin manager, else the first active one.
	const managerBySubject = new Map<number, (typeof managerRows)[number]>();
	for (const m of managerRows) {
		const current = managerBySubject.get(m.subjectUserId);
		const isAdmin = !!(m.roles as { admin?: boolean } | null)?.admin;
		if (!current || (isAdmin && !(current.roles as { admin?: boolean } | null)?.admin)) managerBySubject.set(m.subjectUserId, m);
	}

	// Latest claim per person (newest first from the query) → source + verified + claimant.
	const claimBySubject = new Map<number, (typeof claimRows)[number]>();
	for (const c of claimRows) if (!claimBySubject.has(c.subjectUserId)) claimBySubject.set(c.subjectUserId, c);

	// Latest verification per campaign → the applied profile's review state.
	const verificationByCampaign = new Map<number, (typeof verificationRows)[number]>();
	for (const v of verificationRows) if (!verificationByCampaign.has(v.campaignId)) verificationByCampaign.set(v.campaignId, v);

	const rows: ProfileRow[] = personIds.map((id) => {
		const person = personById.get(id);
		const seat = seatBySubject.get(id);
		const run = runBySubject.get(id);
		const claim = claimBySubject.get(id);
		const manager = managerBySubject.get(id);

		// Source: a claim wins; else a manager (the applicant) means applied; else seeded.
		const source: ProfileSource = claim ? 'claimed' : manager ? 'applied' : 'seeded';

		// Verified = the review-workflow state, keyed off source (seeded never reviewed).
		let verified: ProfileVerified;
		if (person?.deletedAt) verified = 'deleted';
		else if (source === 'seeded') verified = null;
		else if (source === 'claimed') verified = claim!.outcome ?? 'pending';
		else {
			// applied: the run's verification. verifiedAt = approved; else latest request outcome.
			const v = run ? verificationByCampaign.get(run.campaignId) : undefined;
			verified = run?.verifiedAt ? 'approved' : v ? (v.outcome ?? 'pending') : null;
		}

		const slug = person?.slug ?? null;
		const name = person ? fullName(person) : 'Unknown';
		return {
			profileId: id,
			profileName: name,
			slug,
			status: seat?.status ?? 'aspirant',
			source,
			verified,
			positionTitle: seat?.title ?? '',
			region: seat?.region ?? '',
			regionPath: seat ? seatPath(seat.title, seat.region) : null,
			managerName: manager ? fullName(manager) : claim ? fullName({ firstName: claim.claimantFirst, otherNames: claim.claimantOther }) : null,
			managerId: manager?.userId ?? claim?.claimedBy ?? null,
			// The leader's own dashboard: a verified profile lives under its slug, an
			// in-progress one under its apply UUID (the phantom's auth id).
			adminPath: slug ? `/dashboard/${slug}/profile` : `/dashboard/apply/${person?.authUserId}/profile`,
			profilePath: slug ? leaderPath({ slug }) : `/previews/${id}`,
			campaignYear: run ? ACTIVE_CYCLE : null
		};
	});

	// Search over the visible text columns.
	const q = opts.q?.trim().toLowerCase();
	let filtered = q
		? rows.filter((r) =>
				[r.profileName, r.slug ?? '', r.positionTitle, r.region, r.managerName ?? ''].some((f) => f.toLowerCase().includes(q))
			)
		: rows;

	// Rows that need attention first (anything not seeded), then alphabetical.
	filtered = filtered.sort((a, b) => {
		const aw = a.source === 'seeded' ? 1 : 0;
		const bw = b.source === 'seeded' ? 1 : 0;
		if (aw !== bw) return aw - bw;
		return a.profileName.localeCompare(b.profileName);
	});

	return {
		total: filtered.length,
		profiles: filtered.slice((page - 1) * pageSize, page * pageSize)
	};
}

/** The admin control state for ONE profile — powers the leader-dashboard header
 * block (source + verified badges, Deactivate/Activate, Declare Winner, Delete)
 * that a platform admin sees on any profile via the Profiles tab "Admin" button.
 * Same source/verified derivation as listProfiles, plus the graduatable run. */
export async function getProfileAdminMeta(subjectUserId: number): Promise<{
	source: ProfileSource;
	verified: ProfileVerified;
	deactivated: boolean;
	graduatableCampaignId: number | null;
}> {
	const [person] = await db
		.select({ id: users.id, deletedAt: users.deletedAt })
		.from(users)
		.where(eq(users.id, subjectUserId));

	const [claim] = await db
		.select({ outcome: profileClaims.outcome })
		.from(profileClaims)
		.where(eq(profileClaims.subjectUserId, subjectUserId))
		.orderBy(desc(profileClaims.requestedAt))
		.limit(1);

	const [manager] = await db
		.select({ id: managers.id })
		.from(managers)
		.where(and(eq(managers.subjectUserId, subjectUserId), eq(managers.isActive, true), isNull(managers.deletedAt)));

	// The person's current-cycle main run, and whether it's verified + un-graduated
	// (Declare Winner turns a verified un-graduated run into a `current` term).
	const [run] = await db
		.select({ id: campaigns.id, verifiedAt: campaigns.verifiedAt, leaderId: campaigns.leaderId })
		.from(campaigns)
		.where(and(eq(campaigns.subjectUserId, subjectUserId), eq(campaigns.cycleYear, ACTIVE_CYCLE), isNull(campaigns.parentCampaignId), isNull(campaigns.deletedAt)));

	const source: ProfileSource = claim ? 'claimed' : manager ? 'applied' : 'seeded';

	let verified: ProfileVerified;
	if (person?.deletedAt) verified = 'deleted';
	else if (source === 'seeded') verified = null;
	else if (source === 'claimed') verified = claim!.outcome ?? 'pending';
	else if (run?.verifiedAt) verified = 'approved';
	else {
		const [v] = await db
			.select({ outcome: verifications.outcome })
			.from(verifications)
			.where(run ? eq(verifications.campaignId, run.id) : isNotNull(verifications.id))
			.orderBy(desc(verifications.requestedAt))
			.limit(1);
		verified = run ? (v ? (v.outcome ?? 'pending') : null) : null;
	}

	return {
		source,
		verified,
		deactivated: !!person?.deletedAt,
		graduatableCampaignId: run && run.verifiedAt && !run.leaderId ? run.id : null
	};
}
