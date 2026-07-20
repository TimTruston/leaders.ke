import { randomBytes } from 'node:crypto';
import { fail } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { leaders, profileClaims, users } from '$lib/server/db/schema';
import { requireAdmin } from '$lib/server/dashboard';
import { listClaims, reviewClaim, stageClaimEvidence, type ClaimEvidence, type ClaimSort } from '$lib/server/claims';
import { sendEmail } from '$lib/server/email';
import { fullName } from '$lib/server/leader';
import { getPageSize } from '$lib/server/settings';
import type { Actions, PageServerLoad } from './$types';

const SORTS = new Set<ClaimSort>(['subject', 'claimant', 'requested', 'outcome']);

// Search (`q`) and sort (`sort`/`dir`) run server-side so they span every page.
export const load: PageServerLoad = async (event) => {
	await requireAdmin(event);
	const pageSize = await getPageSize();
	const params = event.url.searchParams;
	const page = Math.max(1, Number(params.get('page') ?? 1));
	const q = params.get('q') ?? '';
	const sortParam = params.get('sort') ?? '';
	const sort = SORTS.has(sortParam as ClaimSort) ? (sortParam as ClaimSort) : undefined;
	const dir = params.get('dir') === 'asc' ? 'asc' : 'desc';
	const { claims, total } = await listClaims(page, pageSize, { q, sort, dir });
	return { claims, total, page, pageSize, q, sort: sort ?? null, dir };
};

export const actions: Actions = {
	review: async (event) => {
		const { domainUser } = await requireAdmin(event);
		const form = await event.request.formData();
		const claimId = Number(form.get('claimId'));
		const outcome = String(form.get('outcome') ?? '');
		const notes = String(form.get('notes') ?? '').trim();

		if (!claimId || (outcome !== 'approved' && outcome !== 'rejected')) {
			return fail(400, { error: 'Invalid request.' });
		}

		const result = await reviewClaim(claimId, domainUser.id, outcome, notes);
		if (!result.ok) return fail(400, { error: result.error });

		return { reviewed: true };
	},

	// Sends the leader their single-use approve/reject link (/claim/[token]) to an
	// address the admin supplies — for profiles whose inbox we know out-of-band
	// (or whose sourced email bounced). Reuses the claim's existing token so a
	// re-send never invalidates a link already in the leader's inbox.
	emailLeader: async (event) => {
		await requireAdmin(event);
		const form = await event.request.formData();
		const claimId = Number(form.get('claimId'));
		const email = String(form.get('email') ?? '').trim().toLowerCase();

		if (!claimId) return fail(400, { error: 'Invalid request.' });
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return fail(400, { error: 'Enter a valid email address.', emailClaimId: claimId });
		}

		const [claim] = await db
			.select({
				subjectUserId: profileClaims.subjectUserId,
				claimedBy: profileClaims.claimedBy,
				evidence: profileClaims.evidence,
				claimantFirstName: users.firstName,
				claimantOtherNames: users.otherNames
			})
			.from(profileClaims)
			.innerJoin(users, eq(profileClaims.claimedBy, users.id))
			.where(and(eq(profileClaims.id, claimId), isNull(profileClaims.outcome)));
		if (!claim) return fail(400, { error: 'Only pending claims can be sent to the leader.' });

		const [subject] = await db
			.select({ firstName: users.firstName, otherNames: users.otherNames })
			.from(users)
			.where(eq(users.id, claim.subjectUserId));
		if (!subject) return fail(400, { error: 'Claimed profile not found.' });

		const evidence = (claim.evidence ?? {}) as ClaimEvidence;
		const leaderToken = evidence.leaderToken ?? randomBytes(16).toString('hex');
		if (!evidence.leaderToken) {
			await stageClaimEvidence(claim.subjectUserId, claim.claimedBy, { leaderToken });
		}

		const claimantName = fullName({ firstName: claim.claimantFirstName, otherNames: claim.claimantOtherNames });
		await sendEmail({
			to: email,
			subject: `${claimantName} wants to manage your leaders.ke profile`,
			text: `Hi ${subject.firstName},\n\n${claimantName} submitted a claim to manage your profile on leaders.ke.\n\nReview and approve or reject it here:\n${event.url.origin}/claim/${leaderToken}\n\nIf you don't recognize this person, reject the claim — our admins also review every claim.`
		});

		return { emailed: true, sentTo: email, emailClaimId: claimId };
	}
};
