import { error, fail, redirect } from '@sveltejs/kit';
import { randomBytes, randomInt, createHash } from 'node:crypto';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { donations, followers, managers, pillars, posts } from '$lib/server/db/schema';
import { ACTIVE_CYCLE, fullName, getDomainUser, getOrCreateMainCampaign, leaderPath } from '$lib/server/leader';
import { resolveCampaignRun, loadCampaignWorkspaceData } from '$lib/server/campaign';
import { ownVerifiedContacts } from '$lib/server/dashboard';
import { handleDeleteReviewAction, handleReviewAction } from '$lib/server/reviews';
import { answerConstituentQuestion } from '$lib/server/ai';
import { enforceAskRateLimit } from '$lib/server/aiRateLimit';
import { getGroundingExtras } from '$lib/server/knowledge';
import { findConstituencyBySlug, findCountyBySlug, findWardBySlug, nameToSlugs } from '$lib/data/geo';
import { sendEmail, siteUrl } from '$lib/server/email';
import { sendSms } from '$lib/server/sms';
import type { Actions, PageServerLoad } from './$types';

const CONFIRM_CODE_TTL_MS = 10 * 60_000;
const CONFIRM_CODE_MAX_ATTEMPTS = 5;

function hashConfirmCode(code: string) {
	return createHash('sha256').update(code).digest('hex');
}

// /[leader]/[year]: the active campaign workspace — manifesto with delivery
// tracker, updates, citizen reviews, vote pledges, fundraising and the AI
// constituent chat. Only the active cycle has a workspace; other years bounce
// to the permanent record. Public as soon as the run exists — verifiedAt is a
// "Verified" badge only (see docs/URLDiscovery.md), not a visibility gate.
export const load: PageServerLoad = async ({ params, locals }) => {
	const recordPath = leaderPath({ slug: params.leader });
	if (Number(params.year) !== ACTIVE_CYCLE) redirect(302, recordPath);

	const viewer = locals.user ? await getDomainUser(locals.user.id) : null;
	const row = await resolveCampaignRun(params.leader);
	if (!row) error(404, 'Campaign not found');

	const workspace = await loadCampaignWorkspaceData(row, viewer?.id);
	const name = fullName(row.users);

	// Same "who may manage this profile" check as the public profile page's
	// canEdit: a platform admin, or an active manager on the run's team (the
	// person themselves included — they're their own first manager).
	const viewerIsManager = viewer
		? viewer.id === row.users.id ||
			!!(
				await db
					.select({ id: managers.id })
					.from(managers)
					.where(and(eq(managers.userId, viewer.id), eq(managers.subjectUserId, row.users.id), eq(managers.isActive, true), isNull(managers.deletedAt)))
			)[0]
		: false;
	const canEdit = !!viewer?.adminAt || viewerIsManager;

	return {
		year: Number(params.year),
		recordPath,
		canEdit,
		leaderSlug: params.leader,
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
		// Lets the Follow/Fund blocks prefill (and for Follow, hide) the name/email/
		// geo fields for a signed-in citizen instead of asking them to retype their
		// own details. hasLocation (county set) is the signal the whole
		// county/constituency/ward picker is already known — Follow submits the
		// slugs as hidden fields instead of showing GeoSelect again.
		viewerProfile: viewer
			? {
					name: fullName(viewer),
					email: locals.user?.email ?? '',
					hasLocation: !!viewer.county,
					...nameToSlugs(viewer)
				}
			: null,
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
		const countySlug = String(form.get('county') ?? '').trim();
		const constituencySlug = String(form.get('constituency') ?? '').trim();
		const wardSlug = String(form.get('ward') ?? '').trim();
		if (!name || !contact) return fail(400, { error: 'Your name and a phone or email are required.' });

		const isEmail = contact.includes('@');
		const emailAddress = isEmail ? contact.toLowerCase() : null;
		const phoneNumber = isEmail ? null : contact.replace(/[^\d+]/g, '');
		if (!isEmail && (phoneNumber?.length ?? 0) < 9) {
			return fail(400, { error: 'Enter a valid phone number or email address.' });
		}

		// Optional, same as before ward alone was — GeoSelect's cascading UI already
		// prevents a mismatched combination client-side, this just doesn't trust
		// that blindly. No county falls back to the campaign's own seat region,
		// same default this used before county/constituency existed as fields.
		const county = countySlug ? findCountyBySlug(countySlug) : undefined;
		if (countySlug && !county) return fail(400, { error: 'Select a valid county.' });
		const constituency = constituencySlug ? findConstituencyBySlug(constituencySlug) : undefined;
		if (constituencySlug && (!constituency || !county?.constituencies.includes(constituency))) {
			return fail(400, { error: 'Select a valid constituency for that county.' });
		}
		const ward = wardSlug ? findWardBySlug(wardSlug) : undefined;
		if (wardSlug && (!ward || !constituency?.wards.includes(ward))) {
			return fail(400, { error: 'Select a valid ward for that constituency.' });
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

		// Double opt-in, both channels — skipped only when it's a signed-in citizen
		// using their own already-verified account email/phone (Campaign.svelte
		// hides the field and submits that value directly in that case, so there's
		// nothing left to prove). A guest, or a signed-in citizen whose account
		// contact isn't verified yet, has to confirm and stays excluded from
		// broadcasts (see the broadcasts recipient query) until they do. Nothing
		// else happens if they never do.
		const viewerDomainUser = event.locals.user ? await getDomainUser(event.locals.user.id) : null;
		const emailAlreadyVerified = isEmail && emailAddress === (event.locals.user?.email ?? '').toLowerCase() && !!viewerDomainUser?.verified.email;
		const phoneAlreadyVerified =
			!isEmail && !!phoneNumber && !!viewerDomainUser && (await ownVerifiedContacts(viewerDomainUser.id)).check('sms', phoneNumber);
		const needsConfirm = isEmail ? !emailAlreadyVerified : !phoneAlreadyVerified;
		const confirmToken = needsConfirm && isEmail ? randomBytes(24).toString('hex') : null;
		const confirmCode = needsConfirm && !isEmail ? String(randomInt(0, 1_000_000)).padStart(6, '0') : null;

		await db.insert(followers).values({
			name,
			emailAddress,
			phoneNumber,
			county: county?.name ?? row.positions.region,
			constituency: constituency?.name ?? null,
			ward: ward?.name ?? null,
			digest: 'leader',
			digestId: row.users.id,
			// Contact channel doubles as the digest opt-in; SMS numbers get WhatsApp later, not assumed.
			email: isEmail,
			sms: !isEmail,
			confirmToken,
			confirmCodeHash: confirmCode ? hashConfirmCode(confirmCode) : null,
			confirmCodeExpiresAt: confirmCode ? new Date(Date.now() + CONFIRM_CODE_TTL_MS) : null,
			confirmedAt: needsConfirm ? null : new Date()
		});

		const leaderName = fullName(row.users);
		if (needsConfirm && emailAddress) {
			const confirmUrl = siteUrl(`/follow/confirm/${confirmToken}`);
			await sendEmail({
				to: emailAddress,
				subject: `Confirm you're following ${leaderName}`,
				text: `Hi ${name},\n\nConfirm you'd like to follow ${leaderName}'s campaign and get their updates:\n${confirmUrl}\n\nIf you didn't request this, just ignore this email.`,
				html: `<p>Hi ${name},</p><p>Confirm you'd like to follow ${leaderName}'s campaign and get their updates:</p><p><a href="${confirmUrl}">Confirm my subscription</a></p><p>If you didn't request this, just ignore this email.</p>`
			});
		} else if (needsConfirm && phoneNumber && confirmCode) {
			await sendSms(phoneNumber, `Your leaders.ke code to confirm following ${leaderName} is ${confirmCode}. It expires in 10 minutes.`);
		}

		return { followed: true, name, needsConfirm, isEmail, phoneNumber: isEmail ? undefined : phoneNumber };
	},

	confirmPhone: async (event) => {
		const row = await resolveCampaignRun(event.params.leader);
		if (!row) return fail(400, { error: 'Campaign not found.' });

		const form = await event.request.formData();
		const phoneNumber = String(form.get('phone') ?? '').replace(/[^\d+]/g, '');
		const code = String(form.get('code') ?? '').trim();
		if (!phoneNumber || !code) return fail(400, { error: 'Enter the code we texted you.' });

		const [follower] = await db
			.select()
			.from(followers)
			.where(
				and(
					eq(followers.digest, 'leader'),
					eq(followers.digestId, row.users.id),
					eq(followers.phoneNumber, phoneNumber),
					isNull(followers.deletedAt),
					isNull(followers.confirmedAt)
				)
			)
			.orderBy(desc(followers.createdAt))
			.limit(1);

		// `locked: true` on these three means no resubmit of this form can ever
		// succeed (wrong code below is the only retryable failure) — Campaign.svelte
		// disables the code input/button rather than let the citizen keep trying.
		if (!follower?.confirmCodeHash || !follower.confirmCodeExpiresAt) {
			return fail(400, { error: 'No pending confirmation for that number. Follow again to get a new code.', locked: true });
		}
		if (follower.confirmAttempts >= CONFIRM_CODE_MAX_ATTEMPTS) {
			return fail(400, { error: 'Too many attempts. Follow again to get a new code.', locked: true });
		}
		if (follower.confirmCodeExpiresAt < new Date()) {
			return fail(400, { error: 'That code expired. Follow again to get a new one.', locked: true });
		}

		if (hashConfirmCode(code) !== follower.confirmCodeHash) {
			await db
				.update(followers)
				.set({ confirmAttempts: follower.confirmAttempts + 1 })
				.where(eq(followers.id, follower.id));
			return fail(400, { error: 'Incorrect code.', phoneNumber });
		}

		await db.update(followers).set({ confirmedAt: new Date() }).where(eq(followers.id, follower.id));
		return { confirmed: true, name: follower.name };
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

		const rateLimit = await enforceAskRateLimit(event);
		if (!rateLimit.ok) return fail(429, { error: rateLimit.error });

		const row = await resolveCampaignRun(event.params.leader);
		if (!row) return fail(404, { error: 'Campaign not found.' });

		const [pillarRows, postRows, extras] = await Promise.all([
			db
				.select({ title: pillars.title, summary: pillars.summary, deliveryStatus: pillars.deliveryStatus, evidence: pillars.evidence })
				.from(pillars)
				.where(and(eq(pillars.campaignId, row.campaignId), isNull(pillars.deletedAt))),
			db
				.select({ title: posts.title, body: posts.body })
				.from(posts)
				.where(and(eq(posts.subjectUserId, row.users.id), eq(posts.medium, 'web'), eq(posts.public, true), isNull(posts.deletedAt)))
				.orderBy(desc(posts.createdAt))
				.limit(10),
			getGroundingExtras(row.users.id)
		]);
		const grounding = {
			name: fullName(row.users),
			positionTitle: row.positions.title,
			regionLabel: row.positions.region,
			status: row.status,
			bio: row.users.bio ?? '',
			pillars: pillarRows,
			posts: postRows,
			...extras
		};

		const { answer, source } = await answerConstituentQuestion(grounding, question);
		return { asked: true, question, answer, answerSource: source };
	}
};
