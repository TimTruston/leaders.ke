// Citizen reviews shared by the leader profile (/[leader]) and campaign
// (/[leader]/[year]) pages: public-review listing, pillar options for the
// review form, and the submit action (one live review per user per subject).
// Reviews are public the moment they're posted; a flagReason hides one from
// public view (reversible) instead of gating publication behind approval.
import { fail, type RequestEvent } from '@sveltejs/kit';
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, conversations, messages, pillars, reviews, users } from '$lib/server/db/schema';
import { fullName, getDomainUser } from '$lib/server/leader';

export const REVIEW_MESSAGE_MAX_LENGTH = 500;

export const REVIEW_FLAG_REASONS = [
	'spam',
	'insult',
	'incitement',
	'hate_speech',
	'misinformation',
	'other'
] as const;
export type ReviewFlagReason = (typeof REVIEW_FLAG_REASONS)[number];

export type ReviewItem = {
	id: number;
	rating: number;
	message: string;
	pillarTitle: string | null;
	likes: number;
	authorName: string | null; // null when the reviewer kept their name private
	createdAt: string;
	response: { body: string; createdAt: string } | null;
	// Only ever set on the viewer's own review — everyone else's flagged
	// reviews are excluded from the query entirely, not just marked.
	flagReason: ReviewFlagReason | null;
};

/** The latest leader/manager response per review id, keyed for O(1) lookup. */
async function getResponsesByReviewId(
	reviewIds: number[]
): Promise<Map<number, { body: string; createdAt: Date }>> {
	const responseRows = reviewIds.length
		? await db
				.select({ reviewId: messages.reviewId, body: messages.body, createdAt: messages.createdAt })
				.from(messages)
				.where(inArray(messages.reviewId, reviewIds))
				.orderBy(desc(messages.createdAt))
		: [];
	// First match per reviewId wins since responseRows is newest-first: the latest response.
	const responseByReviewId = new Map<number, { body: string; createdAt: Date }>();
	for (const r of responseRows) {
		if (r.reviewId && !responseByReviewId.has(r.reviewId)) {
			responseByReviewId.set(r.reviewId, { body: r.body, createdAt: r.createdAt });
		}
	}
	return responseByReviewId;
}

export type MyReviewItem = {
	id: number;
	rating: number;
	message: string;
	pillarId: number | null;
	public: boolean;
	hasResponse: boolean; // locks editing once the candidate's team has replied
	flagReason: ReviewFlagReason | null; // locks editing; delete and repost instead
};

export type ModerationReviewItem = {
	id: number;
	rating: number;
	message: string;
	pillarTitle: string | null;
	likes: number;
	reviewerName: string; // always shown to the leader/manager, regardless of the `public` flag
	public: boolean;
	flagReason: ReviewFlagReason | null;
	createdAt: string;
	response: { body: string; createdAt: string } | null;
};

/** Public, live reviews for a person (users.id), newest first. Reviews follow the
 * person across every seat they've held or vied for, not just their current one.
 * Visibility: the viewer's own review (`viewerUserId`) always shows, flagged or
 * private or not — so they can see and delete it. Everyone else only sees
 * reviews that are public AND unflagged; a private or flagged review from
 * someone else is excluded entirely, not just anonymized. The campaign team
 * sees every review regardless, via listReviewsForModeration. */
export async function listApprovedReviews(
	subjectId: number,
	viewerUserId?: number
): Promise<ReviewItem[]> {
	const publiclyVisible = and(eq(reviews.public, true), isNull(reviews.flagReason));

	const rows = await db
		.select({
			id: reviews.id,
			rating: reviews.rating,
			message: reviews.message,
			likes: reviews.likes,
			public: reviews.public,
			flagReason: reviews.flagReason,
			pillarTitle: pillars.title,
			createdAt: reviews.createdAt,
			firstName: users.firstName,
			otherNames: users.otherNames
		})
		.from(reviews)
		.innerJoin(users, eq(reviews.userId, users.id))
		.leftJoin(pillars, eq(reviews.pillarId, pillars.id))
		.where(
			and(
				eq(reviews.subjectId, subjectId),
				isNull(reviews.deletedAt),
				viewerUserId ? or(eq(reviews.userId, viewerUserId), publiclyVisible) : publiclyVisible
			)
		)
		.orderBy(desc(reviews.createdAt));

	const responseByReviewId = await getResponsesByReviewId(rows.map((r) => r.id));

	return rows.map((r) => {
		const response = responseByReviewId.get(r.id);
		return {
			id: r.id,
			rating: r.rating,
			message: r.message,
			pillarTitle: r.pillarTitle,
			likes: r.likes,
			authorName: r.public ? fullName({ firstName: r.firstName, otherNames: r.otherNames }) : null,
			createdAt: r.createdAt.toISOString(),
			response: response ? { body: response.body, createdAt: response.createdAt.toISOString() } : null,
			flagReason: r.flagReason
		};
	});
}

/** Counts of this person's flagged (hidden) reviews, by reason — shown publicly
 * as a transparency signal so a leader flagging reviews isn't invisible to citizens,
 * even though the flagged content itself stays hidden. */
export async function getFlaggedReviewCounts(
	subjectId: number
): Promise<{ total: number; byReason: Partial<Record<ReviewFlagReason, number>> }> {
	const rows = await db
		.select({ reason: reviews.flagReason, n: count() })
		.from(reviews)
		.where(and(eq(reviews.subjectId, subjectId), isNotNull(reviews.flagReason), isNull(reviews.deletedAt)))
		.groupBy(reviews.flagReason);

	const byReason: Partial<Record<ReviewFlagReason, number>> = {};
	let total = 0;
	for (const r of rows) {
		if (!r.reason) continue;
		byReason[r.reason] = r.n;
		total += r.n;
	}
	return { total, byReason };
}

/** The signed-in citizen's own live review of this person, if any, for the
 * "leave a review" form to switch into edit/delete mode instead. */
export async function getMyReview(subjectId: number, reviewerId: number): Promise<MyReviewItem | null> {
	const [row] = await db
		.select({
			id: reviews.id,
			rating: reviews.rating,
			message: reviews.message,
			pillarId: reviews.pillarId,
			public: reviews.public,
			flagReason: reviews.flagReason
		})
		.from(reviews)
		.where(
			and(eq(reviews.userId, reviewerId), eq(reviews.subjectId, subjectId), isNull(reviews.deletedAt))
		)
		// Deterministic even if stale duplicate rows ever exist: the most recent wins.
		.orderBy(desc(reviews.createdAt))
		.limit(1);
	if (!row) return null;

	const [response] = await db
		.select({ id: messages.id })
		.from(messages)
		.where(eq(messages.reviewId, row.id))
		.limit(1);

	return { ...row, hasResponse: !!response };
}

/** The leader's live main-campaign pillars, as options for the review form's pillar dropdown. */
export async function listReviewPillarOptions(leaderId: number) {
	return await db
		.select({ id: pillars.id, title: pillars.title })
		.from(pillars)
		.innerJoin(campaigns, eq(pillars.campaignId, campaigns.id))
		.where(
			and(
				eq(campaigns.leaderId, leaderId),
				isNull(campaigns.parentCampaignId),
				isNull(campaigns.deletedAt),
				isNull(pillars.deletedAt)
			)
		)
		.orderBy(asc(pillars.id));
}

/**
 * Handles the `?/review` form action. `subjectId` (users.id) is who the review
 * attaches to; `leaderId` scopes which campaign's pillars the dropdown validates
 * against (whichever seat's page the citizen is reviewing from). Requires a
 * signed-in user; validates rating (integer 1-5) and message (max
 * REVIEW_MESSAGE_MAX_LENGTH chars). Goes public immediately. A second
 * submission by the same user updates their existing review instead of
 * inserting a duplicate, but only while it's unflagged and the candidate's
 * team hasn't responded yet — either one locks the review's content in
 * place; delete it and post a new one instead.
 */
export async function handleReviewAction(event: RequestEvent, subjectId: number, leaderId: number) {
	if (!event.locals.user) return fail(401, { reviewError: 'Sign in to leave a review.' });
	const domainUser = await getDomainUser(event.locals.user.id);
	if (!domainUser) return fail(401, { reviewError: 'Sign in to leave a review.' });

	const form = await event.request.formData();
	const rating = Number(form.get('rating'));
	const message = String(form.get('message') ?? '').trim();
	const pillarIdRaw = String(form.get('pillarId') ?? '').trim();
	const showName = form.get('public') === 'on';

	if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
		return fail(400, { reviewError: 'Pick a star rating from 1 to 5.' });
	}
	if (!message) return fail(400, { reviewError: 'Write a short review first.' });
	if (message.length > REVIEW_MESSAGE_MAX_LENGTH) {
		return fail(400, { reviewError: `Keep your review under ${REVIEW_MESSAGE_MAX_LENGTH} characters.` });
	}

	// A pillar choice only counts if it actually belongs to this campaign.
	let pillarId: number | null = null;
	if (pillarIdRaw) {
		const options = await listReviewPillarOptions(leaderId);
		pillarId = options.find((p) => p.id === Number(pillarIdRaw))?.id ?? null;
	}

	const existing = await getMyReview(subjectId, domainUser.id);

	if (existing) {
		if (existing.hasResponse) {
			return fail(400, { reviewError: "This review can't be edited since the candidate's team has responded." });
		}
		if (existing.flagReason) {
			return fail(400, { reviewError: 'This review was flagged and can\'t be edited. Delete it and post a new one.' });
		}
		await db
			.update(reviews)
			.set({ rating, message, pillarId, public: showName })
			.where(eq(reviews.id, existing.id));
	} else {
		await db.insert(reviews).values({
			userId: domainUser.id,
			subjectId,
			rating,
			message,
			pillarId,
			public: showName
		});
	}

	return { reviewed: true, updated: !!existing };
}

/** Handles the `?/deleteReview` form action: soft-deletes the signed-in
 * citizen's own review of this person. Always allowed, even after a response,
 * since only editing (not withdrawing) needs to be locked. */
export async function handleDeleteReviewAction(event: RequestEvent, subjectId: number) {
	if (!event.locals.user) return fail(401, { reviewError: 'Sign in first.' });
	const domainUser = await getDomainUser(event.locals.user.id);
	if (!domainUser) return fail(401, { reviewError: 'Sign in first.' });

	await db
		.update(reviews)
		.set({ deletedAt: new Date() })
		.where(
			and(eq(reviews.userId, domainUser.id), eq(reviews.subjectId, subjectId), isNull(reviews.deletedAt))
		);

	return { deleted: true };
}

/** Every live review of a person, newest first, for the leader/manager moderation queue. */
export async function listReviewsForModeration(subjectId: number): Promise<ModerationReviewItem[]> {
	const rows = await db
		.select({
			id: reviews.id,
			rating: reviews.rating,
			message: reviews.message,
			likes: reviews.likes,
			public: reviews.public,
			flagReason: reviews.flagReason,
			pillarTitle: pillars.title,
			createdAt: reviews.createdAt,
			firstName: users.firstName,
			otherNames: users.otherNames
		})
		.from(reviews)
		.innerJoin(users, eq(reviews.userId, users.id))
		.leftJoin(pillars, eq(reviews.pillarId, pillars.id))
		.where(and(eq(reviews.subjectId, subjectId), isNull(reviews.deletedAt)))
		.orderBy(desc(reviews.createdAt));

	const responseByReviewId = await getResponsesByReviewId(rows.map((r) => r.id));

	return rows.map((r) => {
		const response = responseByReviewId.get(r.id);
		return {
			id: r.id,
			rating: r.rating,
			message: r.message,
			pillarTitle: r.pillarTitle,
			likes: r.likes,
			reviewerName: fullName({ firstName: r.firstName, otherNames: r.otherNames }),
			public: r.public,
			flagReason: r.flagReason,
			createdAt: r.createdAt.toISOString(),
			response: response ? { body: response.body, createdAt: response.createdAt.toISOString() } : null
		};
	});
}

/** Flags a review (hides it from public view, reversible) or clears the flag.
 * Scoped to `subjectId` so a leader/manager can't moderate someone else's reviews. */
export async function setReviewFlag(
	subjectId: number,
	reviewId: number,
	reason: ReviewFlagReason | null
) {
	await db
		.update(reviews)
		.set({ flagReason: reason, flaggedAt: reason ? new Date() : null })
		.where(and(eq(reviews.id, reviewId), eq(reviews.subjectId, subjectId), isNull(reviews.deletedAt)));
}

/** Posts the leader/manager's response to a review as a message (visible in the
 * review's thread); creates the backing conversation on first response. */
export async function respondToReview(
	subjectId: number,
	leaderId: number,
	reviewId: number,
	sender: 'leader' | 'manager',
	senderId: number,
	body: string
): Promise<boolean> {
	const [review] = await db
		.select({ id: reviews.id })
		.from(reviews)
		.where(and(eq(reviews.id, reviewId), eq(reviews.subjectId, subjectId), isNull(reviews.deletedAt)));
	if (!review) return false;

	const [conversation] = await db
		.insert(conversations)
		.values({ scope: 'leader', scopeId: leaderId, channel: 'web' })
		.returning({ id: conversations.id });

	await db.insert(messages).values({
		conversationId: conversation.id,
		sender,
		senderId,
		reviewId,
		body
	});
	return true;
}
