import { error, fail, redirect } from '@sveltejs/kit';
import { and, asc, count, desc, eq, isNull, or, sum } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	campaigns,
	donations,
	followers,
	pillars,
	pledges,
	posts
} from '$lib/server/db/schema';
import { ACTIVE_CYCLE, fullName, getDomainUser, leaderPath, resolveCurrentTerm } from '$lib/server/leader';
import {
	getFlaggedReviewCounts,
	getMyReview,
	handleDeleteReviewAction,
	handleReviewAction,
	listApprovedReviews,
	listReviewPillarOptions
} from '$lib/server/reviews';
import { answerConstituentQuestion } from '$lib/server/ai';
import type { Actions, PageServerLoad } from './$types';

// /[leader]/[year]: the active campaign workspace — manifesto with delivery
// tracker, updates, citizen reviews, vote pledges, fundraising and the AI
// constituent chat. Only the active cycle has a workspace; other years bounce
// to the permanent record.
export const load: PageServerLoad = async ({ params, locals }) => {
	const recordPath = leaderPath({ slug: params.leader });
	if (Number(params.year) !== ACTIVE_CYCLE) redirect(302, recordPath);

	const row = await requireLiveLeader(params);

	if (!row) error(404, 'Campaign not found');

	const leaderId = row.leaders.id;
	const viewer = locals.user ? await getDomainUser(locals.user.id) : null;

	const [
		pillarRows,
		postRows,
		[followerRow],
		reviewRows,
		reviewPillarOptions,
		flaggedReviewCounts,
		[pledgeRow],
		[raisedRow]
	] = await Promise.all([
		db
			.select({
				title: pillars.title,
				summary: pillars.summary,
				deliveryStatus: pillars.deliveryStatus,
				evidence: pillars.evidence
			})
			.from(pillars)
			.innerJoin(campaigns, eq(pillars.campaignId, campaigns.id))
			.where(and(eq(campaigns.leaderId, leaderId), isNull(pillars.deletedAt)))
			.orderBy(asc(pillars.id)),
		db
			.select({ id: posts.id, title: posts.title, body: posts.body, createdAt: posts.createdAt })
			.from(posts)
			.where(
				and(
					eq(posts.leaderId, leaderId),
					eq(posts.medium, 'web'),
					eq(posts.public, true),
					eq(posts.approved, true),
					isNull(posts.deletedAt)
				)
			)
			.orderBy(desc(posts.createdAt))
			.limit(20),
		db
			.select({ n: count() })
			.from(followers)
			.where(
				and(
					eq(followers.digest, 'leader'),
					eq(followers.digestId, leaderId),
					isNull(followers.deletedAt)
				)
			),
		// Citizen reviews of this person (follows them across every seat), plus
		// this campaign's pillar options for the review form.
		listApprovedReviews(row.users.id, viewer?.id),
		listReviewPillarOptions(leaderId),
		getFlaggedReviewCounts(row.users.id),
		// Live vote pledges across all of the leader's campaigns
		db
			.select({ n: count() })
			.from(pledges)
			.innerJoin(campaigns, eq(pledges.campaignId, campaigns.id))
			.where(and(eq(campaigns.leaderId, leaderId), isNull(pledges.deletedAt))),
		db
			.select({ total: sum(donations.amount) })
			.from(donations)
			.where(
				and(
					eq(donations.leaderId, leaderId),
					eq(donations.status, 'confirmed'),
					isNull(donations.deletedAt)
				)
			)
	]);

	const myReview = viewer ? await getMyReview(row.users.id, viewer.id) : null;

	const name = fullName(row.users);
	return {
		year: Number(params.year),
		recordPath,
		leader: {
			name,
			initials: name
				.split(/\s+/)
				.map((w) => w[0])
				.join('')
				.slice(0, 2)
				.toUpperCase(),
			party: null as string | null,
			regionLabel: row.positions.region,
			positionTitle: row.positions.title,
			status: row.leaders.status,
			verified: !!row.leaders.verifiedAt,
			followers: followerRow.n,
			bio: row.users.bio ?? '',
			pillars: pillarRows
		},
		posts: postRows.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
		reviews: reviewRows,
		reviewPillarOptions,
		flaggedReviewCounts,
		myReview,
		signedIn: !!locals.user,
		pledgeCount: pledgeRow.n,
		fundraising: {
			goal: row.leaders.fundraisingGoal,
			raised: Number(raisedRow.total ?? 0)
		}
	};
};

// Resolves the same leader row the /[leader] profile page would show (whichever
// term isn't 'former'), and requires it to be verified — a campaign workspace is
// never public before the profile it belongs to is.
async function requireLiveLeader(params: { leader: string }) {
	const resolved = await resolveCurrentTerm(params.leader);
	if (!resolved || !resolved.currentTerm.leaders.verifiedAt) return null;
	return {
		users: resolved.row.users,
		leaders: resolved.currentTerm.leaders,
		positions: resolved.currentTerm.positions
	};
}

export const actions: Actions = {
	follow: async (event) => {
		const row = await requireLiveLeader(event.params);
		if (!row) {
			return fail(400, { error: 'Campaign not found.' });
		}

		const form = await event.request.formData();
		const name = String(form.get('name') ?? '').trim();
		const contact = String(form.get('contact') ?? '').trim();
		const ward = String(form.get('ward') ?? '').trim();
		if (!name || !contact) return fail(400, { error: 'Your name and a phone or email are required.' });

		const isEmail = contact.includes('@');
		const emailAddress = isEmail ? contact.toLowerCase() : null;
		const phoneNumber = isEmail ? null : contact.replace(/[^\d+]/g, '');
		if (!isEmail && (phoneNumber?.length ?? 0) < 9) {
			return fail(400, { error: 'Enter a valid phone number or email address.' });
		}

		// App-layer dedupe for account-less follows: one live follow per contact per leader.
		const duplicate = await db
			.select({ id: followers.id })
			.from(followers)
			.where(
				and(
					eq(followers.digest, 'leader'),
					eq(followers.digestId, row.leaders.id),
					isNull(followers.deletedAt),
					or(
						emailAddress ? eq(followers.emailAddress, emailAddress) : undefined,
						phoneNumber ? eq(followers.phoneNumber, phoneNumber) : undefined
					)
				)
			)
			.limit(1);
		if (duplicate.length > 0) {
			return fail(400, { error: 'You already follow this campaign with that contact.' });
		}

		await db.insert(followers).values({
			name,
			emailAddress,
			phoneNumber,
			county: row.positions.region,
			ward: ward || null,
			digest: 'leader',
			digestId: row.leaders.id,
			// Contact channel doubles as the digest opt-in; SMS numbers get WhatsApp later, not assumed.
			email: isEmail,
			sms: !isEmail
		});

		return { followed: true, name };
	},

	review: async (event) => {
		const row = await requireLiveLeader(event.params);
		if (!row) return fail(400, { reviewError: 'Campaign not found.' });
		return await handleReviewAction(event, row.users.id, row.leaders.id);
	},

	deleteReview: async (event) => {
		const row = await requireLiveLeader(event.params);
		if (!row) return fail(400, { reviewError: 'Campaign not found.' });
		return await handleDeleteReviewAction(event, row.users.id);
	},

	donate: async (event) => {
		const row = await requireLiveLeader(event.params);
		if (!row) return fail(400, { error: 'Campaign not found.' });

		const form = await event.request.formData();
		const donorName = String(form.get('donorName') ?? '').trim();
		const phone = String(form.get('phone') ?? '').replace(/[^\d+]/g, '');
		const amount = Number(form.get('amount') ?? 0);
		if (!donorName || !Number.isFinite(amount) || amount < 10) {
			return fail(400, { error: 'Your name and an amount (KES 10 or more) are required.' });
		}

		await db.insert(donations).values({
			leaderId: row.leaders.id,
			donorName,
			phoneNumber: phone || null,
			amount: Math.round(amount)
		});
		// The campaign confirms receipt against their M-Pesa statement (STK push automates this later).
		return { donated: true, amount: Math.round(amount) };
	},

	ask: async (event) => {
		const form = await event.request.formData();
		const question = String(form.get('question') ?? '').trim();
		if (!question || question.length < 5) {
			return fail(400, { error: 'Ask a question of at least a few words.' });
		}

		const row = await requireLiveLeader(event.params);
		if (!row) return fail(404, { error: 'Campaign not found.' });

		const [pillarRows, postRows] = await Promise.all([
			db
				.select({
					title: pillars.title,
					summary: pillars.summary,
					deliveryStatus: pillars.deliveryStatus,
					evidence: pillars.evidence
				})
				.from(pillars)
				.innerJoin(campaigns, eq(pillars.campaignId, campaigns.id))
				.where(and(eq(campaigns.leaderId, row.leaders.id), isNull(pillars.deletedAt))),
			db
				.select({ title: posts.title, body: posts.body })
				.from(posts)
				.where(
					and(
						eq(posts.leaderId, row.leaders.id),
						eq(posts.medium, 'web'),
						eq(posts.public, true),
						isNull(posts.deletedAt)
					)
				)
				.orderBy(desc(posts.createdAt))
				.limit(10)
		]);
		const grounding = {
			name: fullName(row.users),
			positionTitle: row.positions.title,
			regionLabel: row.positions.region,
			status: row.leaders.status,
			bio: row.users.bio ?? '',
			pillars: pillarRows,
			posts: postRows
		};

		const { answer, source } = await answerConstituentQuestion(grounding, question);
		return { asked: true, question, answer, answerSource: source };
	}
};
