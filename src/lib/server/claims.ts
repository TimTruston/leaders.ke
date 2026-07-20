// onboarding.md option A: "Claim this Profile". Approval doesn't reassign the
// leader row's ownership (see the comment on profileClaims in schema.ts) — it
// makes the claimant an admin manager of the existing profile instead.
import { redirect, type RequestEvent } from '@sveltejs/kit';
import { and, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, contacts, managers, partyMemberships, profileClaims, users } from '$lib/server/db/schema';
import { user as authUsers } from '$lib/server/db/auth.schema';
import { findNationalIdConflict, fullName, resolveCurrentTerm } from '$lib/server/leader';
import { requireDashboardUser } from '$lib/server/dashboard';
import { notifyUser } from '$lib/server/notifications';
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
 * pending claim (null until the first tab save creates it).
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
				isNull(profileClaims.outcome)
			)
		);
	return { domainUser, slug, resolved, claim: claim ?? null };
}

/** Merges one tab's values into the claimant's pending claim, creating the claim
 * on the first save — so it appears in the admin queue as soon as anything is staged. */
export async function stageClaimEvidence(subjectUserId: number, claimedBy: number, patch: Partial<ClaimEvidence>) {
	const [existing] = await db
		.select({ id: profileClaims.id, evidence: profileClaims.evidence })
		.from(profileClaims)
		.where(and(eq(profileClaims.subjectUserId, subjectUserId), eq(profileClaims.claimedBy, claimedBy), isNull(profileClaims.outcome)));

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
	requestedAt: string;
	outcome: 'approved' | 'rejected' | null;
	/** The reviewer's reason, shown under a rejected row in the admin queue. */
	notes: string | null;
	/** The claimed profile's best email on file (verified > sourced > any live). */
	leaderEmail: string | null;
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
		.where(and(eq(profileClaims.subjectUserId, subjectUserId), eq(profileClaims.claimedBy, claimedBy), isNull(profileClaims.outcome)));

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

/** Drops the viewer's pending claim entirely — the "just testing" escape hatch.
 * Decided (approved/rejected) claims stay as history. */
export async function deletePendingClaim(subjectUserId: number, claimedBy: number) {
	await db
		.delete(profileClaims)
		.where(and(eq(profileClaims.subjectUserId, subjectUserId), eq(profileClaims.claimedBy, claimedBy), isNull(profileClaims.outcome)));
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

/** One page of claims, newest first — pending, approved, and rejected — same
 * revertible shape as the verification queue. Returns the total for the pager. */
export async function listClaims(page: number, pageSize: number): Promise<{ claims: ClaimRow[]; total: number }> {
	const [rows, [{ n: total }]] = await Promise.all([
		db
			.select({
				claimId: profileClaims.id,
				subjectUserId: profileClaims.subjectUserId,
				claimedByUserId: profileClaims.claimedBy,
				requestedAt: profileClaims.requestedAt,
				outcome: profileClaims.outcome,
				notes: profileClaims.notes,
				claimantFirstName: users.firstName,
				claimantOtherNames: users.otherNames
			})
			.from(profileClaims)
			.innerJoin(users, eq(profileClaims.claimedBy, users.id))
			.orderBy(desc(profileClaims.requestedAt))
			.limit(pageSize)
			.offset((page - 1) * pageSize),
		db.select({ n: count() }).from(profileClaims)
	]);

	const subjectIds = rows.map((r) => r.subjectUserId);
	const subjectRows = subjectIds.length
		? await db
				.select({ userId: users.id, firstName: users.firstName, otherNames: users.otherNames, slug: users.slug })
				.from(users)
				.where(inArray(users.id, subjectIds))
		: [];
	const subjectByUserId = new Map(subjectRows.map((r) => [r.userId, r]));

	// The leader's best email on file — prefills the admin "Email the leader" form.
	// Verified beats sourced (see contacts.source) beats any other live row.
	const emailRows = await db
		.select({ userId: contacts.userId, value: contacts.value, verifiedAt: contacts.verifiedAt, source: contacts.source })
		.from(contacts)
		.where(and(eq(contacts.channel, 'email'), isNull(contacts.deletedAt)));
	const emailByUserId = new Map<number, string>();
	for (const row of [...emailRows].sort((a, b) => Number(!!b.verifiedAt) - Number(!!a.verifiedAt) || Number(!!b.source) - Number(!!a.source))) {
		if (!emailByUserId.has(row.userId)) emailByUserId.set(row.userId, row.value);
	}

	const claims = rows.map((r) => {
		const subject = subjectByUserId.get(r.subjectUserId);
		return {
			claimId: r.claimId,
			subjectUserId: r.subjectUserId,
			claimedByUserId: r.claimedByUserId,
			claimantName: fullName({ firstName: r.claimantFirstName, otherNames: r.claimantOtherNames }),
			subjectName: subject ? fullName(subject) : 'Unknown',
			subjectSlug: subject?.slug ?? null,
			leaderEmail: subject ? (emailByUserId.get(subject.userId) ?? null) : null,
			requestedAt: r.requestedAt.toISOString(),
			outcome: r.outcome,
			notes: r.notes
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

	// Every claim ever made on this profile, newest first.
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
		.where(eq(profileClaims.subjectUserId, claim.subjectUserId))
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
