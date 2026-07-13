// Admin "Moderation" tab: every flagged review across the whole platform in one
// queue. Leaders/managers can already flag from a profile page (reversible, hides
// the review from public view); this is the admin-side place to review and clear them.
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '$lib/server/db';
import { reviews, users } from '$lib/server/db/schema';
import { fullName } from '$lib/server/leader';

export type FlaggedReviewRow = {
	reviewId: number;
	subjectName: string;
	reviewerName: string;
	reason: string;
	message: string;
	flaggedAt: string;
};

export async function listFlaggedReviews(): Promise<FlaggedReviewRow[]> {
	const subject = alias(users, 'subject');
	const reviewer = alias(users, 'reviewer');

	const rows = await db
		.select({
			reviewId: reviews.id,
			public: reviews.public,
			reason: reviews.flagReason,
			message: reviews.message,
			flaggedAt: reviews.flaggedAt,
			subjectFirstName: subject.firstName,
			subjectOtherNames: subject.otherNames,
			reviewerFirstName: reviewer.firstName,
			reviewerOtherNames: reviewer.otherNames
		})
		.from(reviews)
		.innerJoin(subject, eq(reviews.subjectId, subject.id))
		.innerJoin(reviewer, eq(reviews.userId, reviewer.id))
		.where(and(isNotNull(reviews.flagReason), isNull(reviews.deletedAt)))
		.orderBy(desc(reviews.flaggedAt));

	return rows.map((r) => ({
		reviewId: r.reviewId,
		subjectName: fullName({ firstName: r.subjectFirstName, otherNames: r.subjectOtherNames }),
		reviewerName: r.public
			? fullName({ firstName: r.reviewerFirstName, otherNames: r.reviewerOtherNames })
			: 'Anonymous',
		reason: r.reason!,
		message: r.message,
		flaggedAt: r.flaggedAt!.toISOString()
	}));
}

/** Clears a flag, restoring the review to public view (matches the per-profile unflag). */
export async function unflagReview(reviewId: number) {
	await db
		.update(reviews)
		.set({ flagReason: null, flaggedAt: null })
		.where(eq(reviews.id, reviewId));
}
