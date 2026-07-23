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
import { alias } from 'drizzle-orm/pg-core';
import { db } from '$lib/server/db';
import { campaigns, contacts, leaders, managers, positions, profileClaims, users, verifications } from '$lib/server/db/schema';
import { user as authUsers } from '$lib/server/db/auth.schema';
import { ACTIVE_CYCLE, fullName, leaderPath } from '$lib/server/leader';
import { seatPath } from '$lib/utils/seat';
import { formatKenyanPhoneDisplay } from '$lib/utils/phone';
import { notifyUser } from '$lib/server/notifications';
import { getPlatformSettings } from '$lib/server/settings';

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
	// The person's most recent lifecycle event (run/term/claim/manager change) — drives
	// the default "recent first" sort; ISO string, epoch 0 if the person has no dated record.
	lastActivityAt: string;
};

export type ProfilePage = { profiles: ProfileRow[]; total: number };

// Sortable columns. `recent` (default) is the person's last lifecycle activity —
// newest run/term/claim/manager change — newest first; the rest map to a visible column.
export type ProfileSort = 'recent' | 'name' | 'position' | 'region' | 'status' | 'source' | 'verified';

type Seat = { title: string; region: string; status: 'aspirant' | 'current' | 'former' };

/** Every leader profile, one row per person. Admin-only and a few thousand rows, so
 * (like the old candidates tab) it fetches in bulk, merges/searches/sorts in JS, then
 * paginates. `q` matches name, slug, and seat. */
export async function listProfiles(
	page: number,
	pageSize: number,
	opts: { q?: string; sort?: ProfileSort; dir?: 'asc' | 'desc' } = {}
): Promise<ProfilePage> {
	const [termRows, runRows, managerSubjectRows, claimSubjectRows] = await Promise.all([
		db
			.select({
				userId: leaders.userId,
				status: leaders.status,
				title: positions.title,
				region: positions.region,
				createdAt: leaders.createdAt
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
				region: positions.region,
				createdAt: campaigns.createdAt
			})
			.from(campaigns)
			.innerJoin(positions, eq(campaigns.positionId, positions.id))
			.where(and(eq(campaigns.cycleYear, ACTIVE_CYCLE), isNull(campaigns.parentCampaignId), isNull(campaigns.deletedAt))),
		// A freshly created/claimed profile has neither a leaders nor a campaigns row
		// yet — campaign creation is intentional now, not automatic on signup/claim —
		// so an active manager or a claim is what makes it a "profile" here too.
		db.select({ userId: managers.subjectUserId }).from(managers).where(and(eq(managers.isActive, true), isNull(managers.deletedAt))),
		db.select({ userId: profileClaims.subjectUserId }).from(profileClaims)
	]);

	// The full person set: anyone with a held term, a 2027 run, an active manager
	// (created/claimed, even before a seat/campaign is declared), or a claim on record.
	const personIds = [
		...new Set([
			...termRows.map((r) => r.userId),
			...runRows.map((r) => r.userId),
			...managerSubjectRows.map((r) => r.userId),
			...claimSubjectRows.map((r) => r.userId)
		])
	];
	if (personIds.length === 0) return { profiles: [], total: 0 };

	const [personRows, managerRows, claimRows] = await Promise.all([
		db
			.select({ id: users.id, firstName: users.firstName, otherNames: users.otherNames, slug: users.slug, authUserId: users.authUserId, deletedAt: users.deletedAt })
			.from(users)
			.where(inArray(users.id, personIds)),
		db
			.select({ subjectUserId: managers.subjectUserId, userId: managers.userId, roles: managers.roles, updatedAt: managers.updatedAt, firstName: users.firstName, otherNames: users.otherNames })
			.from(managers)
			.innerJoin(users, eq(managers.userId, users.id))
			.where(and(inArray(managers.subjectUserId, personIds), eq(managers.isActive, true), isNull(managers.deletedAt))),
		db
			.select({ subjectUserId: profileClaims.subjectUserId, outcome: profileClaims.outcome, requestedAt: profileClaims.requestedAt, deletedAt: profileClaims.deletedAt, claimantFirst: users.firstName, claimantOther: users.otherNames, claimedBy: profileClaims.claimedBy })
			.from(profileClaims)
			.innerJoin(users, eq(profileClaims.claimedBy, users.id))
			.where(inArray(profileClaims.subjectUserId, personIds))
			.orderBy(desc(profileClaims.requestedAt))
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

	// Last lifecycle activity per person — max over their run/term createdAt, claim
	// requestedAt and manager updatedAt — for the default "recent first" sort.
	const lastActivityBySubject = new Map<number, number>();
	const bump = (userId: number, at: Date | null | undefined) => {
		if (!at) return;
		const t = at.getTime();
		if (t > (lastActivityBySubject.get(userId) ?? 0)) lastActivityBySubject.set(userId, t);
	};
	for (const t of termRows) bump(t.userId, t.createdAt);
	for (const r of runRows) bump(r.userId, r.createdAt);
	for (const c of claimRows) bump(c.subjectUserId, c.requestedAt);
	for (const m of managerRows) bump(m.subjectUserId, m.updatedAt);

	const rows: ProfileRow[] = personIds.map((id) => {
		const person = personById.get(id);
		const seat = seatBySubject.get(id);
		const run = runBySubject.get(id);
		const claim = claimBySubject.get(id);
		const manager = managerBySubject.get(id);

		// Source: a claim wins; else a manager (the applicant) means applied; else seeded.
		const source: ProfileSource = claim ? 'claimed' : manager ? 'applied' : 'seeded';

		// Verified = the review-workflow state, keyed off source (seeded never reviewed).
		// 'applied' is a direct admin toggle now (campaigns.verifiedAt) — no more
		// submit/pending/rejected states, just verified or not yet.
		let verified: ProfileVerified;
		if (person?.deletedAt) verified = 'deleted';
		else if (source === 'seeded') verified = null;
		else if (source === 'claimed') verified = claim!.outcome ?? 'pending';
		else verified = run?.verifiedAt ? 'approved' : null;

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
			// The leader's own dashboard — a slug always exists (onboarding mints it
			// at payment time, before anyone can manage a profile at all).
			adminPath: `/dashboard/${slug}/profile`,
			profilePath: slug ? leaderPath({ slug }) : `/previews/${id}`,
			campaignYear: run ? ACTIVE_CYCLE : null,
			lastActivityAt: new Date(lastActivityBySubject.get(id) ?? 0).toISOString()
		};
	});

	// Search over the visible text columns.
	const q = opts.q?.trim().toLowerCase();
	let filtered = q
		? rows.filter((r) =>
				[r.profileName, r.slug ?? '', r.positionTitle, r.region, r.managerName ?? ''].some((f) => f.toLowerCase().includes(q))
			)
		: rows;

	// Column sort — default `recent` (last activity, newest first). A tie always
	// falls back to name so the order is stable page to page.
	const sort = opts.sort ?? 'recent';
	const dir = opts.dir ?? (sort === 'recent' ? 'desc' : 'asc');
	const sourceRank = { claimed: 0, applied: 1, seeded: 2 } as const;
	const verifiedRank: Record<string, number> = { pending: 0, rejected: 1, approved: 2, deleted: 3 };
	const cmp = (a: ProfileRow, b: ProfileRow) => {
		switch (sort) {
			case 'name':
				return a.profileName.localeCompare(b.profileName);
			case 'position':
				return a.positionTitle.localeCompare(b.positionTitle) || a.region.localeCompare(b.region);
			case 'region':
				return a.region.localeCompare(b.region);
			case 'status':
				return a.status.localeCompare(b.status);
			case 'source':
				return sourceRank[a.source] - sourceRank[b.source];
			case 'verified':
				return (verifiedRank[a.verified ?? ''] ?? -1) - (verifiedRank[b.verified ?? ''] ?? -1);
			default: // recent
				return a.lastActivityAt.localeCompare(b.lastActivityAt);
		}
	};
	filtered = filtered.sort((a, b) => {
		const base = cmp(a, b);
		const signed = dir === 'desc' ? -base : base;
		return signed || a.profileName.localeCompare(b.profileName);
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
	// Campaign badge (campaigns.verifiedAt): a direct admin toggle, same pattern as
	// identity — no submit/review queue. campaignDocsComplete gates whether the
	// control bar's Verify button can act — only checks the IEBC certificate when
	// platform_settings.requireIebcForVerification is on (off by default).
	campaignVerified: boolean;
	campaignDocsComplete: boolean;
	// Whether the owner clicked Submit for Verification (campaigns.verificationRequestedAt)
	// — the control bar's Verify button only acts once this is set, so a checklist
	// still in progress reads as "Incomplete" rather than an actionable Verify.
	campaignSubmitted: boolean;
	application: { id: number; applicantId: number; applicantName: string; email: string | null; phone: string | null } | null;
	// The pending decision the admin control bar surfaces inline (moved off the Team
	// tab): a live claim to approve/reject.
	claim: { id: number; claimantId: number; claimantName: string; email: string | null; phone: string | null } | null;
	// An already-approved claim, once granted, has no "before" snapshot to diff
	// against — access was immediate at payment time — so unlike claim above, this
	// stays reviewable indefinitely, not just while pending. Lets the control bar
	// offer a Reject next to the "approved" badge at any point, not only up front.
	approvedClaimId: number | null;
}> {
	const [person] = await db
		.select({
			id: users.id,
			firstName: users.firstName,
			otherNames: users.otherNames,
			slug: users.slug,
			deletedAt: users.deletedAt
		})
		.from(users)
		.where(eq(users.id, subjectUserId));

	// The claimant is profileClaims.claimedBy (join to that account, not the subject).
	const [claim] = await db
		.select({ id: profileClaims.id, outcome: profileClaims.outcome, deletedAt: profileClaims.deletedAt, claimantId: users.id, first: users.firstName, other: users.otherNames })
		.from(profileClaims)
		.innerJoin(users, eq(profileClaims.claimedBy, users.id))
		.where(eq(profileClaims.subjectUserId, subjectUserId))
		.orderBy(desc(profileClaims.requestedAt))
		.limit(1);

	// The applicant is the managing ACCOUNT (managers.userId), not the profile subject —
	// prefer the admin manager (the creator/owner).
	const [application] = await db
		.select({ id: managers.id, applicantId: users.id, first: users.firstName, other: users.otherNames, admin: managers.roles })
		.from(managers)
		.innerJoin(users, eq(managers.userId, users.id))
		.where(and(eq(managers.subjectUserId, subjectUserId), eq(managers.isActive, true), isNull(managers.deletedAt)))
		.orderBy(desc(managers.id));

	// The applicant's / claimant's own contact info (email + phone) for the "…by" line,
	// falling back to their login email when they have no saved contact rows.
	const accountIds = [claim?.claimantId, application?.applicantId].filter((x): x is number => !!x);
	const contactByUser = new Map<number, { email: string | null; phone: string | null; authEmail: string | null }>();
	if (accountIds.length) {
		const [contactRows, authRows] = await Promise.all([
			db
				.select({ userId: contacts.userId, channel: contacts.channel, value: contacts.value })
				.from(contacts)
				.where(and(inArray(contacts.userId, accountIds), isNull(contacts.deletedAt))),
			db
				.select({ userId: users.id, email: authUsers.email })
				.from(users)
				.innerJoin(authUsers, eq(users.authUserId, authUsers.id))
				.where(inArray(users.id, accountIds))
		]);
		for (const r of contactRows) {
			const e = contactByUser.get(r.userId) ?? { email: null, phone: null, authEmail: null };
			if (r.channel === 'email') e.email = r.value;
			if (r.channel === 'sms') e.phone = r.value;
			contactByUser.set(r.userId, e);
		}
		for (const r of authRows) {
			const e = contactByUser.get(r.userId) ?? { email: null, phone: null, authEmail: null };
			e.authEmail = r.email;
			contactByUser.set(r.userId, e);
		}
	}
	const contactsFor = (uid: number) => {
		const c = contactByUser.get(uid);
		// Phone stored as 254…; show it as a local 0700 000 000 on the control bar.
		return { email: c?.email ?? c?.authEmail ?? null, phone: c?.phone ? formatKenyanPhoneDisplay(c.phone) : null };
	};

	// The person's current-cycle main run, and whether it's verified + un-graduated
	// (Declare Winner turns a verified un-graduated run into a `current` term).
	const [run] = await db
		.select({ id: campaigns.id, verifiedAt: campaigns.verifiedAt, leaderId: campaigns.leaderId, iebcCertificateUrl: campaigns.iebcCertificateUrl, verificationRequestedAt: campaigns.verificationRequestedAt })
		.from(campaigns)
		.where(and(eq(campaigns.subjectUserId, subjectUserId), eq(campaigns.cycleYear, ACTIVE_CYCLE), isNull(campaigns.parentCampaignId), isNull(campaigns.deletedAt)));

	// Admin-tunable: the IEBC certificate isn't required until settings turn it
	// on (off by default — certs aren't issued until closer to nominations).
	const { requireIebcForVerification } = await getPlatformSettings();

	const source: ProfileSource = claim ? 'claimed' : application ? 'applied' : 'seeded';

	// 'applied' is a direct admin toggle now (campaigns.verifiedAt) — no more
	// submit/pending/rejected states, just verified or not yet.
	let verified: ProfileVerified;
	if (person?.deletedAt) verified = 'deleted';
	else if (source === 'seeded') verified = null;
	else if (source === 'claimed') verified = claim!.outcome ?? 'pending';
	else verified = run?.verifiedAt ? 'approved' : null;

	return {
		source,
		verified,
		deactivated: !!person?.deletedAt,
		graduatableCampaignId: run && run.verifiedAt && !run.leaderId ? run.id : null,
		campaignVerified: !!run?.verifiedAt,
		campaignDocsComplete: requireIebcForVerification ? !!run?.iebcCertificateUrl : true,
		campaignSubmitted: !!run?.verificationRequestedAt,
		application: application
			? { id: application.id, applicantId: application.applicantId, applicantName: fullName({ firstName: application.first, otherNames: application.other }), ...contactsFor(application.applicantId) }
			: null,
		// A live (pending) claim is decidable here; a decided/withdrawn one isn't.
		claim:
			claim && claim.outcome === null && !claim.deletedAt
				? { id: claim.id, claimantId: claim.claimantId, claimantName: fullName({ firstName: claim.first, otherNames: claim.other }), ...contactsFor(claim.claimantId) }
				: null,
		approvedClaimId: claim && claim.outcome === 'approved' && !claim.deletedAt ? claim.id : null
	};
}

export type ProfileExtras = Awaited<ReturnType<typeof getProfileExtras>>;

/** The review history for one profile's expandable row on the Profiles tab, fetched
 * on demand. Two independent logs, shown by source:
 *  - claimHistory: every CLAIM ever made on THIS person (past claimants + verdicts) —
 *    for seeded/claimed profiles (an applied one can't be claimed).
 *  - applications: every verification the profile's APPLICANT submitted, across every
 *    candidate they represent (the agency view) — for applied profiles.
 * Same columns the old claims/verifications tables showed, minus team & sign-off. */
export async function getProfileExtras(subjectUserId: number) {
	const claimant = alias(users, 'claimant');
	const claimReviewer = alias(users, 'claim_reviewer');
	const applicantUser = alias(users, 'applicant');
	const candidate = alias(users, 'candidate');
	const verificationReviewer = alias(users, 'verification_reviewer');
	// The applicant's manager row on each candidate — carries their self-declared role.
	const applicantManager = alias(managers, 'applicant_manager');

	// The profile's controlling account — the applicant whose applications we log.
	const [applicant] = await db
		.select({ userId: managers.userId, first: applicantUser.firstName, other: applicantUser.otherNames })
		.from(managers)
		.innerJoin(applicantUser, eq(managers.userId, applicantUser.id))
		.where(and(eq(managers.subjectUserId, subjectUserId), eq(managers.isActive, true), isNull(managers.deletedAt)))
		.orderBy(desc(managers.id));

	const [claimRows, applicationRows] = await Promise.all([
		db
			.select({
				id: profileClaims.id,
				claimantId: claimant.id,
				claimantFirst: claimant.firstName,
				claimantOther: claimant.otherNames,
				// The claimant's self-declared role, staged in the claim's sign-off.
				evidence: profileClaims.evidence,
				requestedAt: profileClaims.requestedAt,
				outcome: profileClaims.outcome,
				deletedAt: profileClaims.deletedAt,
				reviewedAt: profileClaims.reviewedAt,
				reviewerFirst: claimReviewer.firstName,
				reviewerOther: claimReviewer.otherNames,
				notes: profileClaims.notes
			})
			.from(profileClaims)
			.innerJoin(claimant, eq(profileClaims.claimedBy, claimant.id))
			.leftJoin(claimReviewer, eq(profileClaims.reviewedBy, claimReviewer.id))
			.where(eq(profileClaims.subjectUserId, subjectUserId))
			.orderBy(desc(profileClaims.requestedAt)),
		// Every application this applicant submitted — joined to the candidate each was
		// for, so an agency's whole roster of applications shows here.
		applicant
			? db
					.select({
						id: verifications.id,
						candidateFirst: candidate.firstName,
						candidateOther: candidate.otherNames,
						// The applicant's role on THIS candidate's team (may differ per candidate).
						roles: applicantManager.roles,
						requestedAt: verifications.requestedAt,
						outcome: verifications.outcome,
						reviewedAt: verifications.reviewedAt,
						reviewerFirst: verificationReviewer.firstName,
						reviewerOther: verificationReviewer.otherNames,
						notes: verifications.notes
					})
					.from(verifications)
					.innerJoin(campaigns, eq(verifications.campaignId, campaigns.id))
					.innerJoin(candidate, eq(campaigns.subjectUserId, candidate.id))
					.leftJoin(
						applicantManager,
						and(
							eq(applicantManager.userId, verifications.requestedBy),
							eq(applicantManager.subjectUserId, campaigns.subjectUserId),
							isNull(applicantManager.deletedAt)
						)
					)
					.leftJoin(verificationReviewer, eq(verifications.reviewedBy, verificationReviewer.id))
					.where(eq(verifications.requestedBy, applicant.userId))
					.orderBy(desc(verifications.requestedAt))
			: Promise.resolve([])
	]);

	// The claimant's own contacts (their citizen account, not the profile being
	// claimed) — falling back to their login email when they never added one.
	const claimantIds = claimRows.map((h) => h.claimantId);
	const [claimantContactRows, claimantAuthRows] = claimantIds.length
		? await Promise.all([
				db
					.select({ userId: contacts.userId, channel: contacts.channel, value: contacts.value })
					.from(contacts)
					.where(and(inArray(contacts.userId, claimantIds), isNull(contacts.deletedAt))),
				db
					.select({ userId: users.id, email: authUsers.email })
					.from(users)
					.innerJoin(authUsers, eq(users.authUserId, authUsers.id))
					.where(inArray(users.id, claimantIds))
			])
		: [[], []];
	const claimantEmailById = new Map<number, string>();
	for (const row of claimantAuthRows) claimantEmailById.set(row.userId, row.email);
	const claimantPhoneById = new Map<number, string>();
	for (const row of claimantContactRows) {
		if (row.channel === 'email' && !claimantEmailById.has(row.userId)) claimantEmailById.set(row.userId, row.value);
		if (row.channel === 'sms' && !claimantPhoneById.has(row.userId)) claimantPhoneById.set(row.userId, row.value);
	}

	return {
		applicantName: applicant ? fullName({ firstName: applicant.first, otherNames: applicant.other }) : null,
		claimHistory: claimRows.map((h) => {
			const ev = (h.evidence as { signoff?: { myRole?: string; nationalId?: string }; nationalId?: string } | null) ?? {};
			const phone = claimantPhoneById.get(h.claimantId);
			return {
			id: h.id,
			claimantName: fullName({ firstName: h.claimantFirst, otherNames: h.claimantOther }),
			email: claimantEmailById.get(h.claimantId) ?? null,
			phone: phone ? formatKenyanPhoneDisplay(phone) : null,
			role: ev.signoff?.myRole ?? null,
			nationalId: ev.signoff?.nationalId ?? ev.nationalId ?? null,
			requestedAt: h.requestedAt.toISOString(),
			outcome: h.outcome,
			deleted: !!h.deletedAt,
			reviewedAt: h.reviewedAt ? h.reviewedAt.toISOString() : null,
			reviewerName: h.reviewerFirst ? fullName({ firstName: h.reviewerFirst, otherNames: h.reviewerOther ?? '' }) : null,
			notes: h.notes
			};
		}),
		applications: applicationRows.map((h) => {
			const roles = (h.roles as { title?: string; nationalId?: string } | null) ?? {};
			return {
			id: h.id,
			candidateName: fullName({ firstName: h.candidateFirst, otherNames: h.candidateOther }),
			role: roles.title ?? null,
			nationalId: roles.nationalId ?? null,
			requestedAt: h.requestedAt.toISOString(),
			outcome: h.outcome,
			reviewedAt: h.reviewedAt ? h.reviewedAt.toISOString() : null,
			reviewerName: h.reviewerFirst ? fullName({ firstName: h.reviewerFirst, otherNames: h.reviewerOther ?? '' }) : null,
			notes: h.notes
			};
		})
	};
}

/** Tells every active manager of a profile (the whole team, not just whoever's
 * signed in) when an admin flips its Deactivate/Activate state — deactivating
 * takes it off the public pages, so the team finds out from a notification
 * instead of a confused "why did my page vanish?" moment. */
export async function notifyManagersOfStatusChange(subjectUserId: number, active: boolean) {
	const [subject] = await db.select({ firstName: users.firstName, otherNames: users.otherNames, slug: users.slug }).from(users).where(eq(users.id, subjectUserId));
	const profileName = subject ? fullName(subject) : 'Your profile';

	const managerRows = await db
		.select({ userId: managers.userId })
		.from(managers)
		.where(and(eq(managers.subjectUserId, subjectUserId), eq(managers.isActive, true), isNull(managers.deletedAt)));

	await Promise.all(
		managerRows.map((m) =>
			notifyUser(m.userId, {
				kind: 'moderation',
				title: active ? 'Your profile has been reactivated' : 'Your profile has been deactivated',
				body: active
					? `${profileName}'s profile is public again.`
					: `${profileName}'s profile has been deactivated by a platform admin. \nIt is hidden from the public and inaccessible to its managers until reactivated.`,
				// A deactivated profile's own dashboard route is off-limits to its team
				// (see getLeaderContextBySlug) — the link only makes sense once reactivated.
				href: active && subject?.slug ? `/dashboard/${subject.slug}/profile` : '/dashboard'
			})
		)
	);
}

/** Tells every platform admin that a profile's checklist is complete and ready
 * for their manual Verify-campaign toggle (see getProfileAdminMeta) — the owner's
 * "Submit for Verification" click has nothing else to do, since there's no
 * submit/review queue anymore, just this heads-up. */
export async function notifyAdminsOfVerificationRequest(subjectUserId: number) {
	const [subject] = await db.select({ firstName: users.firstName, otherNames: users.otherNames, slug: users.slug }).from(users).where(eq(users.id, subjectUserId));
	if (!subject) return;
	const profileName = fullName(subject);

	const admins = await db.select({ id: users.id }).from(users).where(and(isNotNull(users.adminAt), isNull(users.deletedAt)));

	await Promise.all(
		admins.map((admin) =>
			notifyUser(admin.id, {
				kind: 'verification',
				title: 'A profile requests verification',
				body: `${profileName}'s campaign checklist is complete and ready for review.\n<a href="/${subject.slug}">Click here to view the profile</a>`,
				href: `/dashboard/${subject.slug}/profile`,
				linkLabel: 'Click here to review the profile'
			})
		)
	);
}
