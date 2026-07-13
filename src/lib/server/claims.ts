// onboarding.md option A: "Claim this Profile". Approval doesn't reassign the
// leader row's ownership (see the comment on profileClaims in schema.ts) — it
// makes the claimant an admin manager of the existing profile instead.
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { leaders, managers, profileClaims, users } from '$lib/server/db/schema';
import { fullName } from '$lib/server/leader';

export type ClaimRow = {
	claimId: number;
	leaderId: number;
	claimedByUserId: number;
	claimantName: string;
	subjectName: string;
	requestedAt: string;
	outcome: 'approved' | 'rejected' | null;
};

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

/** Every claim ever made, newest first — pending, approved, and rejected — same
 * revertible shape as the verification queue. */
export async function listClaims(): Promise<ClaimRow[]> {
	const claimant = { firstName: users.firstName, otherNames: users.otherNames };
	const rows = await db
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
		.orderBy(desc(profileClaims.requestedAt));

	const subjectRows = await db
		.select({ leaderId: leaders.id, firstName: users.firstName, otherNames: users.otherNames })
		.from(leaders)
		.innerJoin(users, eq(leaders.userId, users.id));
	const subjectByLeaderId = new Map(subjectRows.map((r) => [r.leaderId, fullName(r)]));

	return rows.map((r) => ({
		claimId: r.claimId,
		leaderId: r.leaderId,
		claimedByUserId: r.claimedByUserId,
		claimantName: fullName({ firstName: r.claimantFirstName, otherNames: r.claimantOtherNames }),
		subjectName: subjectByLeaderId.get(r.leaderId) ?? 'Unknown',
		requestedAt: r.requestedAt.toISOString(),
		outcome: r.outcome
	}));
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
