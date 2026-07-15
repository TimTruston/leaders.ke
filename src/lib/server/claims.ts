// onboarding.md option A: "Claim this Profile". Approval doesn't reassign the
// leader row's ownership (see the comment on profileClaims in schema.ts) — it
// makes the claimant an admin manager of the existing profile instead.
import { redirect, type RequestEvent } from '@sveltejs/kit';
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { leaders, managers, profileClaims, users } from '$lib/server/db/schema';
import { fullName, resolveCurrentTerm } from '$lib/server/leader';
import { requireDashboardUser } from '$lib/server/dashboard';

/** What a claimant stages tab by tab under /dashboard/claim/[slug]/* — held in
 * profileClaims.evidence until an admin approves; the public profile is never
 * touched before then. */
export type ClaimEvidence = {
	profile?: { firstName: string; otherNames: string; bio: string; positionId: number };
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
	if (!resolved || !resolved.currentTerm.leaders.verifiedAt) redirect(302, '/dashboard');

	const [claim] = await db
		.select()
		.from(profileClaims)
		.where(
			and(
				eq(profileClaims.leaderId, resolved.currentTerm.leaders.id),
				eq(profileClaims.claimedBy, domainUser.id),
				isNull(profileClaims.outcome)
			)
		);
	return { domainUser, slug, resolved, claim: claim ?? null };
}

/** Merges one tab's values into the claimant's pending claim, creating the claim
 * on the first save — so it appears in the admin queue as soon as anything is staged. */
export async function stageClaimEvidence(leaderId: number, claimedBy: number, patch: Partial<ClaimEvidence>) {
	const [existing] = await db
		.select({ id: profileClaims.id, evidence: profileClaims.evidence })
		.from(profileClaims)
		.where(and(eq(profileClaims.leaderId, leaderId), eq(profileClaims.claimedBy, claimedBy), isNull(profileClaims.outcome)));

	if (existing) {
		const evidence = { ...((existing.evidence as ClaimEvidence | null) ?? {}), ...patch };
		await db.update(profileClaims).set({ evidence }).where(eq(profileClaims.id, existing.id));
	} else {
		await db.insert(profileClaims).values({ leaderId, claimedBy, evidence: patch });
	}
}

export type ClaimRow = {
	claimId: number;
	leaderId: number;
	claimedByUserId: number;
	claimantName: string;
	subjectName: string;
	requestedAt: string;
	outcome: 'approved' | 'rejected' | null;
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
	if (!resolved || !resolved.currentTerm.leaders.verifiedAt) redirect(302, '/dashboard');
	const leaderId = resolved.currentTerm.leaders.id;

	const [existing] = await db
		.select({ id: profileClaims.id, evidence: profileClaims.evidence })
		.from(profileClaims)
		.where(and(eq(profileClaims.leaderId, leaderId), eq(profileClaims.claimedBy, claimedBy), isNull(profileClaims.outcome)));

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
	await stageClaimEvidence(leaderId, claimedBy, { contacts });
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
			leaderId: profileClaims.leaderId,
			claimantFirstName: users.firstName,
			claimantOtherNames: users.otherNames
		})
		.from(profileClaims)
		.innerJoin(users, eq(profileClaims.claimedBy, users.id))
		.where(and(sql`${profileClaims.evidence}->>'leaderToken' = ${token}`, isNull(profileClaims.outcome)));
	if (!row) return null;

	const [subject] = await db
		.select({ id: users.id, firstName: users.firstName, otherNames: users.otherNames })
		.from(leaders)
		.innerJoin(users, eq(leaders.userId, users.id))
		.where(eq(leaders.id, row.leaderId));
	if (!subject) return null;

	return {
		claimId: row.claimId,
		leaderId: row.leaderId,
		// The profile's own users row — recorded as the reviewer on approval.
		subjectUserId: subject.id,
		subjectName: fullName(subject),
		claimantName: fullName({ firstName: row.claimantFirstName, otherNames: row.claimantOtherNames })
	};
}

/** Drops the viewer's pending claim entirely — the "just testing" escape hatch.
 * Decided (approved/rejected) claims stay as history. */
export async function deletePendingClaim(leaderId: number, claimedBy: number) {
	await db
		.delete(profileClaims)
		.where(and(eq(profileClaims.leaderId, leaderId), eq(profileClaims.claimedBy, claimedBy), isNull(profileClaims.outcome)));
}

/** Submits a claim. Fails if this user already has one pending for this leader. */
export async function requestClaim(leaderId: number, claimedBy: number, evidence: Record<string, string>) {
	const [existing] = await db
		.select({ id: profileClaims.id })
		.from(profileClaims)
		.where(
			and(eq(profileClaims.leaderId, leaderId), eq(profileClaims.claimedBy, claimedBy), isNull(profileClaims.outcome))
		);
	if (existing) return { ok: false as const, error: 'You already have a claim pending review for this profile.' };

	await db.insert(profileClaims).values({ leaderId, claimedBy, evidence });
	return { ok: true as const };
}

/** One page of claims, newest first — pending, approved, and rejected — same
 * revertible shape as the verification queue. Returns the total for the pager. */
export async function listClaims(page: number, pageSize: number): Promise<{ claims: ClaimRow[]; total: number }> {
	const [rows, [{ n: total }]] = await Promise.all([
		db
			.select({
				claimId: profileClaims.id,
				leaderId: profileClaims.leaderId,
				claimedByUserId: profileClaims.claimedBy,
				requestedAt: profileClaims.requestedAt,
				outcome: profileClaims.outcome,
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

	const subjectRows = await db
		.select({ leaderId: leaders.id, firstName: users.firstName, otherNames: users.otherNames })
		.from(leaders)
		.innerJoin(users, eq(leaders.userId, users.id));
	const subjectByLeaderId = new Map(subjectRows.map((r) => [r.leaderId, fullName(r)]));

	const claims = rows.map((r) => ({
		claimId: r.claimId,
		leaderId: r.leaderId,
		claimedByUserId: r.claimedByUserId,
		claimantName: fullName({ firstName: r.claimantFirstName, otherNames: r.claimantOtherNames }),
		subjectName: subjectByLeaderId.get(r.leaderId) ?? 'Unknown',
		requestedAt: r.requestedAt.toISOString(),
		outcome: r.outcome
	}));
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

	if (outcome === 'approved') {
		const [existing] = await db
			.select({ id: managers.id })
			.from(managers)
			.where(and(eq(managers.userId, claim.claimedBy), eq(managers.leaderId, claim.leaderId)));

		if (existing) {
			await db
				.update(managers)
				.set({ roles: { admin: true }, isActive: true, deletedAt: null })
				.where(eq(managers.id, existing.id));
		} else {
			await db.insert(managers).values({
				userId: claim.claimedBy,
				leaderId: claim.leaderId,
				roles: { admin: true }
			});
		}
	} else {
		await db
			.update(managers)
			.set({ isActive: false, deletedAt: new Date() })
			.where(and(eq(managers.userId, claim.claimedBy), eq(managers.leaderId, claim.leaderId)));
	}

	await db
		.update(profileClaims)
		.set({ outcome, notes: notes || null, reviewedBy: adminUserId, reviewedAt: new Date() })
		.where(eq(profileClaims.id, claimId));

	return { ok: true as const };
}
