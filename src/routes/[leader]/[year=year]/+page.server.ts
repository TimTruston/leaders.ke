import { error, fail, redirect } from '@sveltejs/kit';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { donations, followers, pillars, posts } from '$lib/server/db/schema';
import { ACTIVE_CYCLE, fullName, getDomainUser, getOrCreateMainCampaign, leaderPath } from '$lib/server/leader';
import { resolveCampaignRun, loadCampaignWorkspaceData } from '$lib/server/campaign';
import { handleDeleteReviewAction, handleReviewAction } from '$lib/server/reviews';
import { answerConstituentQuestion } from '$lib/server/ai';
import type { Actions, PageServerLoad } from './$types';

// /[leader]/[year]: the active campaign workspace — manifesto with delivery
// tracker, updates, citizen reviews, vote pledges, fundraising and the AI
// constituent chat. Only the active cycle has a workspace; other years bounce
// to the permanent record. An admin, the profile's own person, or one of its
// active managers may preview it before it's verified/public — see
// resolveCampaignRun; everyone else still gets the verified-only gate.
export const load: PageServerLoad = async ({ params, locals }) => {
	const recordPath = leaderPath({ slug: params.leader });
	if (Number(params.year) !== ACTIVE_CYCLE) redirect(302, recordPath);

	const viewer = locals.user ? await getDomainUser(locals.user.id) : null;
	const row = await resolveCampaignRun(params.leader, { viewerId: viewer?.id, isAdmin: !!viewer?.adminAt });
	if (!row) error(404, 'Campaign not found');

	const workspace = await loadCampaignWorkspaceData(row, viewer?.id);
	const name = fullName(row.users);

	return {
		year: Number(params.year),
		recordPath,
		leader: {
			name,
			initials: name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
			photoUrl: row.users.photoUrl,
			party: workspace.party,
			regionLabel: row.positions.region,
			positionTitle: row.positions.title,
			status: row.status,
			verified: row.verified,
			followers: workspace.followers,
			// The run's own pitch (Campaign tab), not the person's general profile bio —
			// this workspace is about the 2027 campaign specifically.
			campaignTitle: workspace.title,
			campaignDescription: workspace.description,
			pillars: workspace.pillars
		},
		posts: workspace.posts,
		reviews: workspace.reviews,
		reviewPillarOptions: workspace.reviewPillarOptions,
		flaggedReviewCounts: workspace.flaggedReviewCounts,
		myReview: workspace.myReview,
		signedIn: !!locals.user,
		pledgeCount: workspace.pledgeCount,
		fundraising: workspace.fundraising
	};
};

export const actions: Actions = {
	follow: async (event) => {
		const row = await resolveCampaignRun(event.params.leader);
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
		const row = await resolveCampaignRun(event.params.leader);
		if (!row) return fail(400, { reviewError: 'Campaign not found.' });
		return await handleReviewAction(event, row.users.id, row.campaignId);
	},

	deleteReview: async (event) => {
		const row = await resolveCampaignRun(event.params.leader);
		if (!row) return fail(400, { reviewError: 'Campaign not found.' });
		return await handleDeleteReviewAction(event, row.users.id);
	},

	donate: async (event) => {
		const row = await resolveCampaignRun(event.params.leader);
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

		const row = await resolveCampaignRun(event.params.leader);
		if (!row) return fail(404, { error: 'Campaign not found.' });

		const [pillarRows, postRows] = await Promise.all([
			db
				.select({ title: pillars.title, summary: pillars.summary, deliveryStatus: pillars.deliveryStatus, evidence: pillars.evidence })
				.from(pillars)
				.where(and(eq(pillars.campaignId, row.campaignId), isNull(pillars.deletedAt))),
			db
				.select({ title: posts.title, body: posts.body })
				.from(posts)
				.where(and(eq(posts.subjectUserId, row.users.id), eq(posts.medium, 'web'), eq(posts.public, true), isNull(posts.deletedAt)))
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
