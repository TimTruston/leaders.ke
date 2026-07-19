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
import { ACTIVE_CYCLE, fullName, getDomainUser, getOrCreateMainCampaign, leaderPath, resolveCurrentTerm } from '$lib/server/leader';
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

	const campaignId = row.campaignId;
	const viewer = locals.user ? await getDomainUser(locals.user.id) : null;

	// Fundraising lives on the run's main campaign. No campaign yet = goal 0, nothing raised.
	const [mainCampaign] = campaignId
		? await db
				.select({ id: campaigns.id, fundraisingGoal: campaigns.fundraisingGoal })
				.from(campaigns)
				.where(and(eq(campaigns.id, campaignId), isNull(campaigns.deletedAt)))
		: [];

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
			.where(and(eq(pillars.campaignId, campaignId), isNull(pillars.deletedAt)))
			.orderBy(asc(pillars.id)),
		db
			.select({ id: posts.id, title: posts.title, body: posts.body, createdAt: posts.createdAt })
			.from(posts)
			.where(
				and(
					eq(posts.subjectUserId, row.users.id),
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
					eq(followers.digestId, row.users.id),
					isNull(followers.deletedAt)
				)
			),
		// Citizen reviews of this person (follows them across every seat), plus
		// this campaign's pillar options for the review form.
		listApprovedReviews(row.users.id, viewer?.id),
		listReviewPillarOptions(campaignId),
		getFlaggedReviewCounts(row.users.id),
		// Live vote pledges across all of this person's runs.
		db
			.select({ n: count() })
			.from(pledges)
			.innerJoin(campaigns, eq(pledges.campaignId, campaigns.id))
			.where(and(eq(campaigns.subjectUserId, row.users.id), isNull(pledges.deletedAt))),
		db
			.select({ total: sum(donations.amount) })
			.from(donations)
			.where(
				and(
					eq(donations.campaignId, mainCampaign?.id ?? 0),
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
			photoUrl: row.users.photoUrl,
			party: null as string | null,
			regionLabel: row.positions.region,
			positionTitle: row.positions.title,
			status: row.status,
			verified: row.verified,
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
			goal: mainCampaign?.fundraisingGoal ?? 0,
			raised: Number(raisedRow.total ?? 0)
		}
	};
};

// Resolves the seat + run the /[leader] profile leads with (a live term, else the
// active run), and requires it to be verified — a campaign workspace is never public
// before the profile it belongs to is. Returns the person, the lead seat, and the
// lead campaign id (0 = none yet); `leaderId` is null for a pure aspirant (no term).
async function requireLiveLeader(params: { leader: string }) {
	const resolved = await resolveCurrentTerm(params.leader);
	if (!resolved) return null;
	const { row, currentTerm, activeRun } = resolved;
	const leadsWithRun = (!currentTerm || currentTerm.leaders.status === 'former') && !!activeRun;
	const verified = leadsWithRun ? !!activeRun!.campaigns.verifiedAt : !!currentTerm?.leaders.verifiedAt;
	if (!verified) return null;

	let campaignId = 0;
	let positions;
	let status: string;
	let leaderId: number | null = null;
	if (leadsWithRun) {
		campaignId = activeRun!.campaigns.id;
		positions = activeRun!.positions;
		status = 'aspirant';
	} else {
		positions = currentTerm!.positions;
		status = currentTerm!.leaders.status;
		leaderId = currentTerm!.leaders.id;
		const [c] = await db
			.select({ id: campaigns.id })
			.from(campaigns)
			.where(and(eq(campaigns.leaderId, leaderId), isNull(campaigns.parentCampaignId), isNull(campaigns.deletedAt)));
		campaignId = c?.id ?? 0;
	}
	return { users: row.users, positions, status, verified, campaignId, leaderId };
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
					eq(followers.digestId, row.users.id),
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
			digestId: row.users.id,
			// Contact channel doubles as the digest opt-in; SMS numbers get WhatsApp later, not assumed.
			email: isEmail,
			sms: !isEmail
		});

		return { followed: true, name };
	},

	review: async (event) => {
		const row = await requireLiveLeader(event.params);
		if (!row) return fail(400, { reviewError: 'Campaign not found.' });
		return await handleReviewAction(event, row.users.id, row.campaignId);
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

		// Donations attach to the run's main campaign. A verified run already has one;
		// a held officeholder's is created on first donation.
		let campaignId = row.campaignId;
		if (!campaignId && row.leaderId) {
			campaignId = (await getOrCreateMainCampaign(row.leaderId, row.users.id, fullName(row.users))).id;
		}
		if (!campaignId) return fail(400, { error: 'Campaign not found.' });
		await db.insert(donations).values({
			campaignId,
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
				.where(and(eq(pillars.campaignId, row.campaignId), isNull(pillars.deletedAt))),
			db
				.select({ title: posts.title, body: posts.body })
				.from(posts)
				.where(
					and(
						eq(posts.subjectUserId, row.users.id),
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
			status: row.status,
			bio: row.users.bio ?? '',
			pillars: pillarRows,
			posts: postRows
		};

		const { answer, source } = await answerConstituentQuestion(grounding, question);
		return { asked: true, question, answer, answerSource: source };
	}
};
