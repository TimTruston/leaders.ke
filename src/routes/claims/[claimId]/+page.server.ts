import { randomBytes } from 'node:crypto';
import { error, fail } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { profileClaims, users } from '$lib/server/db/schema';
import { requireAdmin } from '$lib/server/dashboard';
import { getClaimPreview, reviewClaim, stageClaimEvidence, type ClaimEvidence } from '$lib/server/claims';
import { sendEmail } from '$lib/server/email';
import { fullName } from '$lib/server/leader';
import type { Actions, PageServerLoad } from './$types';

// One claim in full: the profile as it would look once approved (LeaderProfile in
// preview mode, staged evidence overlaid onto the real live data), plus the same
// decision controls as the claims queue.
export const load: PageServerLoad = async (event) => {
	await requireAdmin(event);
	const preview = await getClaimPreview(Number(event.params.claimId));
	if (!preview) error(404, 'Claim not found');
	return { preview };
};

export const actions: Actions = {
	review: async (event) => {
		const { domainUser } = await requireAdmin(event);
		const form = await event.request.formData();
		const outcome = String(form.get('outcome') ?? '');
		const notes = String(form.get('notes') ?? '').trim();

		if (outcome !== 'approved' && outcome !== 'rejected') {
			return fail(400, { error: 'Invalid request.' });
		}

		const result = await reviewClaim(Number(event.params.claimId), domainUser.id, outcome, notes);
		if (!result.ok) return fail(400, { error: result.error });

		return { reviewed: true };
	},

	// Same "email the leader their approve/reject link" action as the claims queue.
	emailLeader: async (event) => {
		await requireAdmin(event);
		const form = await event.request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase();

		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return fail(400, { error: 'Enter a valid email address.' });
		}

		const claimId = Number(event.params.claimId);
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

		const [subject] = await db.select({ firstName: users.firstName, otherNames: users.otherNames }).from(users).where(eq(users.id, claim.subjectUserId));
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

		return { emailed: true, sentTo: email };
	}
};
