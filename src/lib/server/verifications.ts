// onboarding.md: pay-after-approval. A leader submits evidence; an admin reviews
// it; approval is what sets leaders.verifiedAt and locks the person's slug. Payment
// (subscriptions) is a separate, later concern — not gated here.
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { leaders, users, verifications } from '$lib/server/db/schema';
import { isSlugAvailable } from '$lib/server/leader';

export type VerificationRow = {
	verificationId: number;
	leaderId: number;
	userId: number;
	firstName: string;
	otherNames: string;
	slug: string | null;
	requestedAt: string;
	verifiedAt: string | null; // leaders.verifiedAt — the actual live/public state
	outcome: 'approved' | 'rejected' | null; // null = pending
};

/** This leader's live pending (unreviewed) verification request, if any. */
export async function getPendingVerification(leaderId: number) {
	const [row] = await db
		.select({ id: verifications.id, requestedAt: verifications.requestedAt })
		.from(verifications)
		.where(and(eq(verifications.leaderId, leaderId), isNull(verifications.outcome)));
	return row ?? null;
}

/** Submits a verification request. Fails if one is already pending — the
 * partial unique index (one_pending_verification_per_leader) enforces this too,
 * this is just a friendlier error before hitting the DB constraint. */
export async function requestVerification(leaderId: number, requestedBy: number, evidence: Record<string, string>) {
	const existing = await getPendingVerification(leaderId);
	if (existing) return { ok: false as const, error: 'A verification request is already pending review.' };

	await db.insert(verifications).values({ leaderId, requestedBy, evidence });
	return { ok: true as const };
}

export type VerificationPage = { requests: VerificationRow[]; total: number };

/** Every verification request ever made, newest first — pending, approved, and
 * rejected — so an admin can revert a past decision, not just clear the queue. */
export async function listVerifications(page: number, pageSize: number): Promise<VerificationPage> {
	const [rows, [{ total }]] = await Promise.all([
		db
			.select({
				verificationId: verifications.id,
				leaderId: verifications.leaderId,
				userId: users.id,
				firstName: users.firstName,
				otherNames: users.otherNames,
				slug: users.slug,
				requestedAt: verifications.requestedAt,
				verifiedAt: leaders.verifiedAt,
				outcome: verifications.outcome
			})
			.from(verifications)
			.innerJoin(leaders, eq(verifications.leaderId, leaders.id))
			.innerJoin(users, eq(leaders.userId, users.id))
			.orderBy(desc(verifications.requestedAt))
			.limit(pageSize)
			.offset((page - 1) * pageSize),
		db.select({ total: count() }).from(verifications)
	]);

	return {
		total,
		requests: rows.map((r) => ({
			...r,
			requestedAt: r.requestedAt.toISOString(),
			verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString() : null
		}))
	};
}

/**
 * Admin decision on a request — re-reviewable at any time, not just once: approving
 * sets leaders.verifiedAt (and locks the person's slug); rejecting an already-approved
 * request reverts it, clearing verifiedAt and taking the profile back off the public
 * pages (leaders.verifiedAt is what every public page gates on, so this is a real revert).
 */
export async function reviewVerification(
	verificationId: number,
	adminUserId: number,
	outcome: 'approved' | 'rejected',
	notes: string
) {
	const [request] = await db.select().from(verifications).where(eq(verifications.id, verificationId));
	if (!request) return { ok: false as const, error: 'Request not found.' };

	if (outcome === 'approved') {
		const [leader] = await db.select().from(leaders).where(eq(leaders.id, request.leaderId));
		const [subject] = await db.select().from(users).where(eq(users.id, leader.userId));

		// The slug was only ever a draft while unverified; re-check it's still free
		// (another verified person may have claimed it in the meantime).
		if (subject.slug && !(await isSlugAvailable(subject.slug, subject.id))) {
			return { ok: false as const, error: `The URL "/${subject.slug}" was claimed by someone else. Pick a new one before approving.` };
		}

		await db.update(leaders).set({ verifiedAt: new Date() }).where(eq(leaders.id, request.leaderId));
	} else {
		await db.update(leaders).set({ verifiedAt: null }).where(eq(leaders.id, request.leaderId));
	}

	await db
		.update(verifications)
		.set({ outcome, notes: notes || null, reviewedBy: adminUserId, reviewedAt: new Date() })
		.where(eq(verifications.id, verificationId));

	return { ok: true as const };
}
