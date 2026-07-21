// onboarding.md option A: "Claim this Profile". Approval doesn't reassign the
// leader row's ownership (see the comment on profileClaims in schema.ts) — it
// makes the claimant an admin manager of the existing profile instead.
import { redirect, type RequestEvent } from '@sveltejs/kit';
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '$lib/server/db';
import { campaigns, contacts, leaders, managers, parties, partyMemberships, positions, profileClaims, users } from '$lib/server/db/schema';
import { user as authUsers } from '$lib/server/db/auth.schema';
import { ACTIVE_CYCLE, findNationalIdConflict, fullName, resolveCurrentTerm } from '$lib/server/leader';
import { requireDashboardUser } from '$lib/server/dashboard';
import { notifyUser } from '$lib/server/notifications';
import { loadPublicProfileData, type PublicProfileData } from '$lib/server/publicProfile';
import { signoffComplete } from '$lib/utils/campaignRoles';

/** What a claimant stages tab by tab under /dashboard/claim/[slug]/* — held in
 * profileClaims.evidence until an admin approves; the public profile is never
 * touched before then. */
export type ClaimEvidence = {
	profile?: { firstName: string; otherNames: string; bio: string; partyId?: number | null };
	contacts?: {
		address: string;
		sms: string;
		whatsapp: string;
		email: string;
		website: string;
		socials: Record<string, string>;
		// OTP-confirmed control of the staged destinations (see stageClaimVerifiedContact) —
		// evidence of the claimant's legitimacy, without touching the real profile's contacts.
		smsVerified?: boolean;
		whatsappVerified?: boolean;
		emailVerified?: boolean;
	};
	/** The campaign's items: the leader's public photo + IEBC clearance. */
	documentation?: Partial<Record<'photoUrl' | 'iebcCertificateUrl', string>>;
	/** The claimant's attestation (Signoff tab): who they are to the campaign,
	 * their national ID number, and their own ID images. */
	signoff?: { myRole?: string; nationalId?: string; idFrontUrl?: string; idBackUrl?: string };
	/** Set by the final "Submit Claim" step — a claim without these is still a draft. */
	nationalId?: string;
	submittedAt?: string;
	/** Single-use token mailed to the profile's verified email so the leader can
	 * approve/reject the claim themselves (see /claim/[token]). */
	leaderToken?: string;
};

/**
 * Resolves + authorizes a /dashboard/claim/[slug]/* request. Only verified
 * (public) profiles are claimable — an unverified one belongs to the account
 * still building it. Returns the viewer, the resolved leader, and the viewer's
 * live claim: pending (null until the first tab save creates it), or a
 * rejected one still open for editing/resubmission. An approved claim is
 * terminal (the claimant already manages the profile), so it's excluded here.
 */
export async function resolveClaimRequest(event: RequestEvent) {
	const { domainUser } = await requireDashboardUser(event);
	const slug = (event.params as { slug?: string }).slug ?? '';
	const resolved = await resolveCurrentTerm(slug);
	// Claimable when the profile is publicly live: a verified held term OR a verified
	// run (an aspirant has no leaders row). Managers attach to the person either way.
	if (!resolved || (!resolved.currentTerm?.leaders.verifiedAt && !resolved.activeRun)) redirect(302, '/dashboard');

	const [claim] = await db
		.select()
		.from(profileClaims)
		.where(
			and(
				eq(profileClaims.subjectUserId, resolved.row.users.id),
				eq(profileClaims.claimedBy, domainUser.id),
				or(isNull(profileClaims.outcome), eq(profileClaims.outcome, 'rejected')),
				isNull(profileClaims.deletedAt)
			)
		)
		.orderBy(desc(profileClaims.requestedAt))
		.limit(1);

	// Only seeded/unowned profiles are claimable — an applied (or already-claimed)
	// profile is owned by a manager. Allow the caller's own in-flight claim through
	// (so a pending claimant can keep editing), but never start a new claim on an
	// owned profile.
	if (!claim) {
		const [owner] = await db
			.select({ id: managers.id })
			.from(managers)
			.where(and(eq(managers.subjectUserId, resolved.row.users.id), eq(managers.isActive, true), isNull(managers.deletedAt)));
		if (owner) redirect(302, '/dashboard');
	}

	return { domainUser, slug, resolved, claim: claim ?? null };
}

/** Resubmitting after a rejection starts a brand-new claim row carrying over the
 * edited evidence — the rejected row stays untouched as permanent history
 * instead of being overwritten. */
export async function resubmitClaim(subjectUserId: number, claimedBy: number, evidence: ClaimEvidence) {
	await db.insert(profileClaims).values({ subjectUserId, claimedBy, evidence });
}

/** Merges one tab's values into the claimant's pending claim, creating the claim
 * on the first save — so it appears in the admin queue as soon as anything is staged. */
export async function stageClaimEvidence(subjectUserId: number, claimedBy: number, patch: Partial<ClaimEvidence>) {
	const [existing] = await db
		.select({ id: profileClaims.id, evidence: profileClaims.evidence })
		.from(profileClaims)
		.where(
			and(
				eq(profileClaims.subjectUserId, subjectUserId),
				eq(profileClaims.claimedBy, claimedBy),
				or(isNull(profileClaims.outcome), eq(profileClaims.outcome, 'rejected')),
				isNull(profileClaims.deletedAt)
			)
		)
		.orderBy(desc(profileClaims.requestedAt))
		.limit(1);

	if (existing) {
		const evidence = { ...((existing.evidence as ClaimEvidence | null) ?? {}), ...patch };
		await db.update(profileClaims).set({ evidence }).where(eq(profileClaims.id, existing.id));
	} else {
		await db.insert(profileClaims).values({ subjectUserId, claimedBy, evidence: patch });
	}
}

export type ClaimRow = {
	claimId: number;
	subjectUserId: number;
	claimedByUserId: number;
	claimantName: string;
	subjectName: string;
	subjectSlug: string | null;
	positionTitle: string;
	region: string;
	requestedAt: string;
	outcome: 'approved' | 'rejected' | null;
	/** The reviewer's reason, shown under a rejected row in the admin queue. */
	notes: string | null;
	/** The claimed profile's best email on file (verified > sourced > any live). */
	leaderEmail: string | null;
	/** Set when the claimant withdrew it themselves ("just testing" escape hatch,
	 * or dropped a stale rejected claim) — the row stays for the admin's audit
	 * trail, but it's no longer live. */
	deletedAt: string | null;
};

/**
 * Marks one staged contact channel as OTP-verified inside the claimant's pending
 * claim (creating the claim if the verify happened before any tab save). The
 * verified destination also becomes the staged value, so verify-then-save can't
 * diverge. Called from the /verify/* routes' claim scope.
 */
export async function stageClaimVerifiedContact(
	slug: string,
	claimedBy: number,
	channel: 'sms' | 'whatsapp' | 'email',
	destination: string
) {
	const resolved = await resolveCurrentTerm(slug);
	// Claimable when the profile is publicly live: a verified held term OR a verified
	// run (an aspirant has no leaders row). Managers attach to the person either way.
	if (!resolved || (!resolved.currentTerm?.leaders.verifiedAt && !resolved.activeRun)) redirect(302, '/dashboard');
	const subjectUserId = resolved.row.users.id;

	const [existing] = await db
		.select({ id: profileClaims.id, evidence: profileClaims.evidence })
		.from(profileClaims)
		.where(
			and(
				eq(profileClaims.subjectUserId, subjectUserId),
				eq(profileClaims.claimedBy, claimedBy),
				or(isNull(profileClaims.outcome), eq(profileClaims.outcome, 'rejected')),
				isNull(profileClaims.deletedAt)
			)
		)
		.orderBy(desc(profileClaims.requestedAt))
		.limit(1);

	const prior = ((existing?.evidence as ClaimEvidence | null) ?? {}).contacts;
	const contacts = {
		address: prior?.address ?? '',
		sms: prior?.sms ?? '',
		whatsapp: prior?.whatsapp ?? '',
		email: prior?.email ?? '',
		website: prior?.website ?? '',
		socials: prior?.socials ?? {},
		smsVerified: prior?.smsVerified ?? false,
		whatsappVerified: prior?.whatsappVerified ?? false,
		emailVerified: prior?.emailVerified ?? false,
		[channel]: destination,
		[`${channel}Verified`]: true
	};
	await stageClaimEvidence(subjectUserId, claimedBy, { contacts });
}

/**
 * Resolves a leader-approval email token to its pending claim (see the
 * /claim/[token] page). A decided claim no longer matches (outcome set), so the
 * link is effectively single-use. Returns the ids + names the page needs.
 */
export async function findClaimByLeaderToken(token: string) {
	if (!/^[0-9a-f]{32}$/i.test(token)) return null;
	const [row] = await db
		.select({
			claimId: profileClaims.id,
			subjectUserId: profileClaims.subjectUserId,
			claimantFirstName: users.firstName,
			claimantOtherNames: users.otherNames
		})
		.from(profileClaims)
		.innerJoin(users, eq(profileClaims.claimedBy, users.id))
		.where(and(sql`${profileClaims.evidence}->>'leaderToken' = ${token}`, isNull(profileClaims.outcome)));
	if (!row) return null;

	const [subject] = await db
		.select({ id: users.id, firstName: users.firstName, otherNames: users.otherNames })
		.from(users)
		.where(eq(users.id, row.subjectUserId));
	if (!subject) return null;

	return {
		claimId: row.claimId,
		// The profile's own users row — recorded as the reviewer on approval.
		subjectUserId: subject.id,
		subjectName: fullName(subject),
		claimantName: fullName({ firstName: row.claimantFirstName, otherNames: row.claimantOtherNames })
	};
}

/** Drops the viewer's claim — the "just testing" escape hatch, also available
 * on a rejected claim so they aren't forced to resubmit it. Soft-deleted: the
 * row (and its rejection notes, if any) stays for the admin's audit trail, it
 * just stops counting as the claimant's live claim. An approved claim can't be
 * dropped this way (deleting it wouldn't undo the manager access it granted). */
export async function deletePendingClaim(subjectUserId: number, claimedBy: number) {
	// Resubmitting after a rejection mints a new row each time, so more than one
	// past-rejected row can exist for this pair — only the CURRENT (latest) one
	// is "the claimant's live claim"; older ones are already permanent history.
	const [current] = await db
		.select({ id: profileClaims.id })
		.from(profileClaims)
		.where(
			and(
				eq(profileClaims.subjectUserId, subjectUserId),
				eq(profileClaims.claimedBy, claimedBy),
				or(isNull(profileClaims.outcome), eq(profileClaims.outcome, 'rejected')),
				isNull(profileClaims.deletedAt)
			)
		)
		.orderBy(desc(profileClaims.requestedAt))
		.limit(1);
	if (!current) return;

	await db.update(profileClaims).set({ deletedAt: new Date() }).where(eq(profileClaims.id, current.id));
}

/** Submits a claim. Fails if this user already has one pending for this leader. */
export async function requestClaim(subjectUserId: number, claimedBy: number, evidence: Record<string, string>) {
	const [existing] = await db
		.select({ id: profileClaims.id })
		.from(profileClaims)
		.where(
			and(eq(profileClaims.subjectUserId, subjectUserId), eq(profileClaims.claimedBy, claimedBy), isNull(profileClaims.outcome))
		);
	if (existing) return { ok: false as const, error: 'You already have a claim pending review for this profile.' };

	await db.insert(profileClaims).values({ subjectUserId, claimedBy, evidence });
	return { ok: true as const };
}

// The columns the claims table header can sort by. Position/Region aren't here:
// a claim's seat is derived post-query (held-term vs run priority), so it isn't a
// sortable/searchable SQL column. `requested` is the default (newest first);
// `subject` is the claimed leader, `claimant` the applicant.
export type ClaimSort = 'subject' | 'claimant' | 'requested' | 'outcome';

/** One page of claims, newest first — pending, approved, and rejected — same
 * revertible shape as the verification queue. Returns the total for the pager.
 * Only SUBMITTED claims show here — a claimant still drafting (evidence staged,
 * "Submit Claim" not yet pressed) isn't in the admin's queue yet. Searchable and
 * sortable across ALL pages: `q` matches the claimed leader and the claimant (name
 * or URL); sort covers those two plus requested/outcome (Position/Region are
 * derived, so they aren't sortable here). */
export async function listClaims(
	page: number,
	pageSize: number,
	opts: { q?: string; sort?: ClaimSort; dir?: 'asc' | 'desc' } = {}
): Promise<{ claims: ClaimRow[]; total: number }> {
	// The claimant and the claimed leader are two separate users rows — alias the
	// leader so both can be selected/searched/sorted in the one paginated query.
	const claimant = alias(users, 'claimant');
	const subject = alias(users, 'subject');

	// A decided claim was necessarily submitted at some point (some older rows
	// predate the evidence.submittedAt field), so outcome set also counts.
	const submitted = or(sql`${profileClaims.evidence}->>'submittedAt' is not null`, isNotNull(profileClaims.outcome));
	const q = opts.q?.trim();
	const search: SQL | undefined = q
		? or(
				ilike(subject.firstName, `%${q}%`),
				ilike(subject.otherNames, `%${q}%`),
				ilike(subject.slug, `%${q}%`),
				ilike(claimant.firstName, `%${q}%`),
				ilike(claimant.otherNames, `%${q}%`)
			)
		: undefined;
	const where = and(submitted, search);

	const sortCol =
		opts.sort === 'subject'
			? subject.firstName
			: opts.sort === 'claimant'
				? claimant.firstName
				: opts.sort === 'outcome'
					? profileClaims.outcome
					: profileClaims.requestedAt;
	const orderBy = (opts.dir === 'asc' ? asc : desc)(sortCol);

	const [rows, [{ n: total }]] = await Promise.all([
		db
			.select({
				claimId: profileClaims.id,
				subjectUserId: profileClaims.subjectUserId,
				claimedByUserId: profileClaims.claimedBy,
				requestedAt: profileClaims.requestedAt,
				outcome: profileClaims.outcome,
				notes: profileClaims.notes,
				deletedAt: profileClaims.deletedAt,
				claimantFirstName: claimant.firstName,
				claimantOtherNames: claimant.otherNames,
				subjectFirstName: subject.firstName,
				subjectOtherNames: subject.otherNames,
				subjectSlug: subject.slug
			})
			.from(profileClaims)
			.innerJoin(claimant, eq(profileClaims.claimedBy, claimant.id))
			.innerJoin(subject, eq(profileClaims.subjectUserId, subject.id))
			.where(where)
			.orderBy(orderBy)
			.limit(pageSize)
			.offset((page - 1) * pageSize),
		db
			.select({ n: count() })
			.from(profileClaims)
			.innerJoin(claimant, eq(profileClaims.claimedBy, claimant.id))
			.innerJoin(subject, eq(profileClaims.subjectUserId, subject.id))
			.where(where)
	]);

	const subjectIds = rows.map((r) => r.subjectUserId);

	// The leader's best email on file — prefills the admin "Email the leader" form.
	// Verified beats sourced (see contacts.source) beats any other live row.
	const emailRows = subjectIds.length
		? await db
				.select({ userId: contacts.userId, value: contacts.value, verifiedAt: contacts.verifiedAt, source: contacts.source })
				.from(contacts)
				.where(and(inArray(contacts.userId, subjectIds), eq(contacts.channel, 'email'), isNull(contacts.deletedAt)))
		: [];
	const emailByUserId = new Map<number, string>();
	for (const row of [...emailRows].sort((a, b) => Number(!!b.verifiedAt) - Number(!!a.verifiedAt) || Number(!!b.source) - Number(!!a.source))) {
		if (!emailByUserId.has(row.userId)) emailByUserId.set(row.userId, row.value);
	}

	// Each subject's current seat: a held term (preferring non-'former') beats a
	// verified 2027 run — same "lead position" priority used elsewhere (an
	// aspirant has no leaders row at all).
	const [termRows, runRows] = subjectIds.length
		? await Promise.all([
				db
					.select({ userId: leaders.userId, status: leaders.status, title: positions.title, region: positions.region })
					.from(leaders)
					.innerJoin(positions, eq(leaders.positionId, positions.id))
					.where(and(inArray(leaders.userId, subjectIds), isNull(leaders.deletedAt))),
				db
					.select({ userId: campaigns.subjectUserId, title: positions.title, region: positions.region })
					.from(campaigns)
					.innerJoin(positions, eq(campaigns.positionId, positions.id))
					.where(
						and(
							inArray(campaigns.subjectUserId, subjectIds),
							eq(campaigns.cycleYear, ACTIVE_CYCLE),
							isNull(campaigns.parentCampaignId),
							isNull(campaigns.deletedAt)
						)
					)
			])
		: [[], []];
	type Seat = { title: string; region: string; status: string };
	const seatBySubject = new Map<number, Seat>();
	for (const t of termRows) {
		const existing = seatBySubject.get(t.userId);
		if (!existing || (existing.status === 'former' && t.status !== 'former')) {
			seatBySubject.set(t.userId, { title: t.title, region: t.region, status: t.status });
		}
	}
	for (const r of runRows) {
		const held = seatBySubject.get(r.userId);
		if (!held || held.status === 'former') {
			seatBySubject.set(r.userId, { title: r.title, region: r.region, status: 'aspirant' });
		}
	}

	const claims = rows.map((r) => {
		const seat = seatBySubject.get(r.subjectUserId);
		return {
			claimId: r.claimId,
			subjectUserId: r.subjectUserId,
			claimedByUserId: r.claimedByUserId,
			claimantName: fullName({ firstName: r.claimantFirstName, otherNames: r.claimantOtherNames }),
			subjectName: fullName({ firstName: r.subjectFirstName, otherNames: r.subjectOtherNames }),
			subjectSlug: r.subjectSlug,
			positionTitle: seat?.title ?? '',
			region: seat?.region ?? '',
			leaderEmail: emailByUserId.get(r.subjectUserId) ?? null,
			requestedAt: r.requestedAt.toISOString(),
			outcome: r.outcome,
			notes: r.notes,
			deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null
		};
	});
	return { claims, total };
}

/**
 * Admin decision, re-reviewable like verifications: approving makes the claimant
 * an active admin manager (or promotes them to admin if already a plain manager);
 * rejecting deactivates that manager row again, reverting the approval.
 */
export async function reviewClaim(claimId: number, adminUserId: number, outcome: 'approved' | 'rejected', notes: string) {
	const [claim] = await db.select().from(profileClaims).where(eq(profileClaims.id, claimId));
	if (!claim) return { ok: false as const, error: 'Claim not found.' };

	const subjectUserId = claim.subjectUserId;

	if (outcome === 'approved') {
		const [existing] = await db
			.select({ id: managers.id })
			.from(managers)
			.where(and(eq(managers.userId, claim.claimedBy), eq(managers.subjectUserId, subjectUserId)));

		if (existing) {
			await db
				.update(managers)
				.set({ roles: { admin: true }, isActive: true, deletedAt: null })
				.where(eq(managers.id, existing.id));
		} else {
			await db.insert(managers).values({
				userId: claim.claimedBy,
				subjectUserId,
				roles: { admin: true }
			});
		}

		// Apply the staged party choice to the person: party membership is a
		// person-level timeline, so end the current live row and start the new one.
		const stagedPartyId = (claim.evidence as ClaimEvidence | null)?.profile?.partyId ?? null;
		const [live] = await db
			.select({ id: partyMemberships.id, partyId: partyMemberships.partyId })
			.from(partyMemberships)
			.where(and(eq(partyMemberships.subjectUserId, subjectUserId), isNull(partyMemberships.deletedAt), isNull(partyMemberships.endAt)));
		if ((live?.partyId ?? null) !== stagedPartyId) {
			if (live) {
				await db.update(partyMemberships).set({ endAt: new Date(), updatedAt: new Date() }).where(eq(partyMemberships.id, live.id));
			}
			if (stagedPartyId) {
				await db.insert(partyMemberships).values({ partyId: stagedPartyId, subjectUserId, role: 'Member', startAt: new Date() });
			}
		}

		// Apply the staged leader photo onto the real profile now that the claim is
		// approved (it was held in the claim's evidence until this point).
		const stagedPhotoUrl = (claim.evidence as ClaimEvidence | null)?.documentation?.photoUrl;
		if (stagedPhotoUrl) {
			await db.update(users).set({ photoUrl: stagedPhotoUrl }).where(eq(users.id, subjectUserId));
		}
	} else {
		await db
			.update(managers)
			.set({ isActive: false, deletedAt: new Date() })
			.where(and(eq(managers.userId, claim.claimedBy), eq(managers.subjectUserId, subjectUserId)));
	}

	await db
		.update(profileClaims)
		.set({ outcome, notes: notes || null, reviewedBy: adminUserId, reviewedAt: new Date() })
		.where(eq(profileClaims.id, claimId));

	// Tell the claimant (in-app notification + email) what was decided and why.
	const [subject] = await db
		.select({ firstName: users.firstName, otherNames: users.otherNames })
		.from(users)
		.where(eq(users.id, claim.subjectUserId));
	const profileName = subject ? fullName(subject) : 'the profile';
	await notifyUser(claim.claimedBy, {
		kind: 'claim',
		title: outcome === 'approved' ? 'Your profile claim was approved' : 'Your profile claim was rejected',
		body:
			outcome === 'approved'
				? `Your claim on ${profileName}'s profile was approved. You now manage this profile from your dashboard.`
				: `Your claim on ${profileName}'s profile was rejected.${notes ? ` Reason: ${notes}` : ''}`,
		href: '/dashboard'
	});

	return { ok: true as const };
}

export type ClaimExtras = NonNullable<Awaited<ReturnType<typeof getClaimExtras>>>;

/**
 * The review-only extras for one claim, shown inline on the admin claims table
 * when a row expands: IEBC cert, the claimant's own sign-off as a one-person
 * "team", and every claim ever made on this profile. The profile itself is
 * previewed on its own page (/[slug]) now, not duplicated here.
 */
export async function getClaimExtras(claimId: number) {
	const [claim] = await db.select().from(profileClaims).where(eq(profileClaims.id, claimId));
	if (!claim) return null;
	const evidence = (claim.evidence as ClaimEvidence | null) ?? {};

	const [claimant] = await db.select().from(users).where(eq(users.id, claim.claimedBy));

	// The person's active run's IEBC cert (staged replacement takes precedence).
	const [subjectRun] = await db
		.select({ id: campaigns.id, iebcCertificateUrl: campaigns.iebcCertificateUrl })
		.from(campaigns)
		.where(and(eq(campaigns.subjectUserId, claim.subjectUserId), isNull(campaigns.parentCampaignId), isNull(campaigns.deletedAt)))
		.orderBy(desc(campaigns.createdAt))
		.limit(1);
	const iebcCertificateUrl = evidence.documentation?.iebcCertificateUrl ?? subjectRun?.iebcCertificateUrl ?? null;

	// The claimant's own contacts (their account), falling back to their login email.
	const [claimantContactRows, [claimantAuth]] = await Promise.all([
		claimant
			? db.select({ channel: contacts.channel, value: contacts.value }).from(contacts).where(and(eq(contacts.userId, claimant.id), isNull(contacts.deletedAt)))
			: Promise.resolve([]),
		claimant ? db.select({ email: authUsers.email }).from(authUsers).where(eq(authUsers.id, claimant.authUserId)) : Promise.resolve([])
	]);
	const signoff = evidence.signoff ?? {};
	const claimantSignoffComplete = signoffComplete(
		{ title: signoff.myRole, nationalId: signoff.nationalId },
		{ idFrontUrl: signoff.idFrontUrl ?? null, idBackUrl: signoff.idBackUrl ?? null }
	);
	const team = claimant
		? [
				{
					name: fullName(claimant),
					title: signoff.myRole ?? null,
					nationalId: signoff.nationalId ?? null,
					idFrontUrl: signoff.idFrontUrl ?? null,
					idBackUrl: signoff.idBackUrl ?? null,
					signoffComplete: claimantSignoffComplete,
					// Flagged for the admin to decide — not a hard block on save (could be a
					// genuine duplicate account for the same person).
					nationalIdConflict:
						claimantSignoffComplete && signoff.nationalId ? await findNationalIdConflict(signoff.nationalId, claimant.id) : null,
					isApplicant: true,
					phone: claimantContactRows.find((r) => r.channel === 'sms')?.value ?? null,
					email: claimantContactRows.find((r) => r.channel === 'email')?.value ?? claimantAuth?.email ?? null
				}
			]
		: [];

	// Every SUBMITTED claim ever made on this profile, newest first — a draft
	// someone else abandoned before submitting isn't part of the review history.
	const historyRows = await db
		.select({
			id: profileClaims.id,
			requestedAt: profileClaims.requestedAt,
			outcome: profileClaims.outcome,
			notes: profileClaims.notes,
			reviewedAt: profileClaims.reviewedAt,
			reviewerFirstName: users.firstName,
			reviewerOtherNames: users.otherNames
		})
		.from(profileClaims)
		.leftJoin(users, eq(profileClaims.reviewedBy, users.id))
		.where(
			and(
				eq(profileClaims.subjectUserId, claim.subjectUserId),
				or(sql`${profileClaims.evidence}->>'submittedAt' is not null`, isNotNull(profileClaims.outcome))
			)
		)
		.orderBy(desc(profileClaims.requestedAt));

	return {
		iebcCertificateUrl,
		team,
		requestHistory: historyRows.map((h) => ({
			id: h.id,
			requestedAt: h.requestedAt.toISOString(),
			outcome: h.outcome,
			notes: h.notes,
			reviewedAt: h.reviewedAt ? h.reviewedAt.toISOString() : null,
			reviewerName: h.reviewerFirstName ? `${h.reviewerFirstName} ${h.reviewerOtherNames}` : null
		}))
	};
}

/** Overlays a claim's staged evidence onto the profile's real (live) data — what
 * the profile will look like once this claim is approved. Only fields a claim can
 * actually stage move; everything else (experience, delivery, followers…) is real. */
function overlayClaimEvidence(data: PublicProfileData, evidence: ClaimEvidence): PublicProfileData {
	const p = evidence.profile;
	const c = evidence.contacts;
	const photoUrl = evidence.documentation?.photoUrl;

	const contactsOverlay = data.contacts.filter((row) => !c || !['sms', 'whatsapp', 'email'].includes(row.channel));
	if (c) {
		if (c.sms) contactsOverlay.push({ channel: 'sms', value: c.sms, verified: !!c.smsVerified });
		if (c.whatsapp) contactsOverlay.push({ channel: 'whatsapp', value: c.whatsapp, verified: !!c.whatsappVerified });
		if (c.email) contactsOverlay.push({ channel: 'email', value: c.email, verified: !!c.emailVerified });
	}

	return {
		...data,
		leader: {
			...data.leader,
			name: p ? fullName({ firstName: p.firstName, otherNames: p.otherNames }) : data.leader.name,
			bio: p?.bio ?? data.leader.bio,
			photoUrl: photoUrl ?? data.leader.photoUrl,
			address: c?.address || data.leader.address,
			socials: c ? { ...data.leader.socials, ...c.socials, ...(c.website ? { website: c.website } : {}) } : data.leader.socials
		},
		contacts: contactsOverlay
	};
}

export type ClaimApprovalPreview = NonNullable<Awaited<ReturnType<typeof getClaimApprovalPreview>>>;

/**
 * How this profile will look once `claimId` is approved: the real live data
 * (admin-bypassed past the verified gate) with the claim's staged edits
 * overlaid on top. Scoped by BOTH the slug and the claimId — two different
 * people can each have their own live claim on the same profile (profileClaims'
 * unique index is (subjectUserId, claimedBy), not subjectUserId alone), so the
 * claimId is what disambiguates "which one" when there's more than one.
 * Viewable by an admin, the claim's own claimant, or an active manager of the
 * profile; null otherwise (or if the claimId doesn't actually belong to this slug).
 */
export async function getClaimApprovalPreview(slug: string, claimId: number, opts: { viewerId?: number; isAdmin?: boolean }) {
	const [claim] = await db.select().from(profileClaims).where(eq(profileClaims.id, claimId));
	if (!claim) return null;

	const [subject] = await db.select({ slug: users.slug }).from(users).where(eq(users.id, claim.subjectUserId));
	if (!subject?.slug || subject.slug !== slug) return null;

	const canPreview =
		!!opts.isAdmin ||
		opts.viewerId === claim.claimedBy ||
		(opts.viewerId
			? !!(
					await db
						.select({ id: managers.id })
						.from(managers)
						.where(and(eq(managers.userId, opts.viewerId), eq(managers.subjectUserId, claim.subjectUserId), isNull(managers.deletedAt)))
				)[0]
			: false);
	if (!canPreview) return null;

	// Admin-bypassed past the verified gate — a pending claim's own profile might
	// itself still be unverified (e.g. claiming an aspirant), and the previewer
	// here is already authorized by the check above regardless.
	const liveData = await loadPublicProfileData(slug, { isAdmin: true });
	if (!liveData) return null;

	const evidence = (claim.evidence as ClaimEvidence | null) ?? {};
	const data = overlayClaimEvidence(liveData, evidence);

	// The person's active run's IEBC cert (staged replacement takes precedence).
	const [run] = await db
		.select({ iebcCertificateUrl: campaigns.iebcCertificateUrl })
		.from(campaigns)
		.where(eq(campaigns.id, liveData.leadCampaignId));
	const iebcCertificateUrl = evidence.documentation?.iebcCertificateUrl ?? run?.iebcCertificateUrl ?? null;

	// Overlay the staged party name, if the claim changes it.
	if (evidence.profile?.partyId !== undefined) {
		const [party] = evidence.profile.partyId
			? await db.select({ name: parties.name, abbreviation: parties.abbreviation }).from(parties).where(eq(parties.id, evidence.profile.partyId))
			: [];
		data.leader.party = party ? `${party.name}${party.abbreviation ? ` (${party.abbreviation})` : ''}` : null;
	}

	const [claimant] = await db.select({ firstName: users.firstName, otherNames: users.otherNames }).from(users).where(eq(users.id, claim.claimedBy));

	return {
		data,
		iebcCertificateUrl,
		outcome: claim.outcome,
		claimantName: claimant ? fullName(claimant) : 'Unknown'
	};
}
