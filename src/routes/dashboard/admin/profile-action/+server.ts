import { redirect } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, leaders, profileClaims, users } from '$lib/server/db/schema';
import { requireAdmin } from '$lib/server/dashboard';
import { redirectWithFlash } from '$lib/server/flash';
import { getProfileAdminMeta, notifyManagersOfStatusChange } from '$lib/server/profiles';
import { graduateCampaign } from '$lib/server/candidates';
import { reviewClaim } from '$lib/server/claims';
import { getPlatformSettings } from '$lib/server/settings';
import type { RequestHandler } from './$types';

// The admin control bar on any leader dashboard posts here — the lifecycle actions
// (Deactivate/Activate, Declare Winner, Delete, Verify Profile) and the inline
// claim decision form. Each campaign's own Verify/Unverify control (per-campaign,
// IEBC-cert-gated) also posts here, carrying its own campaignId. A plain POST +
// 303 back, like /dashboard/notifications; the confirm modal in the layout gates
// the destructive ones.
export const POST: RequestHandler = async (event) => {
	const { domainUser } = await requireAdmin(event);
	const form = await event.request.formData();
	const profileId = Number(form.get('profileId'));
	const action = String(form.get('action') ?? '');
	const next = String(form.get('next') ?? '/dashboard/admin/profiles');

	// Decision forms carry their own target id, not a profileId.
	if (action === 'reviewClaim') {
		await reviewClaim(Number(form.get('claimId')), domainUser.id, form.get('outcome') === 'approved' ? 'approved' : 'rejected', String(form.get('notes') ?? '').trim());
		redirect(303, next);
	}
	// An already-approved claim (access granted at payment time) stays reviewable
	// indefinitely, not just while pending — this is the "Reject" button next to
	// the profile's "approved" badge, not the pending-claim decision form above.
	if (action === 'rejectApprovedClaim') {
		await reviewClaim(Number(form.get('claimId')), domainUser.id, 'rejected', '');
		redirect(303, next);
	}
	if (!profileId) redirect(303, next);

	if (action === 'deactivate') {
		// Reversible suspend: hides the profile from the public + roster until reactivated.
		await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, profileId));
		await notifyManagersOfStatusChange(profileId, false);
	} else if (action === 'activate') {
		await db.update(users).set({ deletedAt: null }).where(eq(users.id, profileId));
		await notifyManagersOfStatusChange(profileId, true);
	} else if (action === 'delete') {
		// Full soft-delete: the person plus every term, run and claim, so nothing
		// resurfaces via a stray term/run. Not the reversible Deactivate toggle.
		const now = new Date();
		await db.update(users).set({ deletedAt: now }).where(eq(users.id, profileId));
		await db.update(leaders).set({ deletedAt: now }).where(and(eq(leaders.userId, profileId), isNull(leaders.deletedAt)));
		await db.update(campaigns).set({ deletedAt: now }).where(and(eq(campaigns.subjectUserId, profileId), isNull(campaigns.deletedAt)));
		await db.update(profileClaims).set({ deletedAt: now }).where(and(eq(profileClaims.subjectUserId, profileId), isNull(profileClaims.deletedAt)));
		// The profile is gone from every leader surface — send the admin back to the roster.
		redirectWithFlash(event.cookies, '/dashboard/admin/profiles', 'Profile deleted.');
	} else if (action === 'declareWinner') {
		const meta = await getProfileAdminMeta(profileId);
		if (meta.graduatableCampaignId) await graduateCampaign(meta.graduatableCampaignId);
	} else if (action === 'verifyProfile') {
		// Direct toggle, same pattern as identity — no submit/review queue. Decoupled
		// from any campaign (each campaign is verified individually, below).
		await db.update(users).set({ profileVerifiedAt: new Date(), verificationRequestedAt: null }).where(eq(users.id, profileId));
	} else if (action === 'unverifyProfile') {
		await db.update(users).set({ profileVerifiedAt: null, verificationRequestedAt: null }).where(eq(users.id, profileId));
	} else if (action === 'verifyRunCampaign') {
		// Per-campaign toggle (one of this person's campaign rows, not necessarily
		// the active cycle) — the IEBC certificate is only required when
		// platform_settings turns that gate on (off by default).
		const campaignId = Number(form.get('campaignId') ?? 0);
		const [run] = await db
			.select({ id: campaigns.id, iebcCertificateUrl: campaigns.iebcCertificateUrl })
			.from(campaigns)
			.where(and(eq(campaigns.id, campaignId), eq(campaigns.subjectUserId, profileId), isNull(campaigns.deletedAt)));
		const { requireIebcForVerification } = await getPlatformSettings();
		if (run && (!requireIebcForVerification || run.iebcCertificateUrl)) {
			await db.update(campaigns).set({ verifiedAt: new Date() }).where(eq(campaigns.id, run.id));
		}
	} else if (action === 'unverifyRunCampaign') {
		const campaignId = Number(form.get('campaignId') ?? 0);
		await db
			.update(campaigns)
			.set({ verifiedAt: null })
			.where(and(eq(campaigns.id, campaignId), eq(campaigns.subjectUserId, profileId), isNull(campaigns.deletedAt)));
	}

	redirect(303, next);
};
