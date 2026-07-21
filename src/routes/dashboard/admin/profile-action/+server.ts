import { redirect } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, leaders, profileClaims, users } from '$lib/server/db/schema';
import { requireAdmin } from '$lib/server/dashboard';
import { redirectWithFlash } from '$lib/server/flash';
import { getProfileAdminMeta } from '$lib/server/profiles';
import { graduateCampaign } from '$lib/server/candidates';
import type { RequestHandler } from './$types';

// The admin header block on any leader dashboard posts here (Deactivate/Activate,
// Declare Winner, Delete). A plain POST + 303 back, like /dashboard/notifications —
// the confirm modal in the layout gates each one.
export const POST: RequestHandler = async (event) => {
	await requireAdmin(event);
	const form = await event.request.formData();
	const profileId = Number(form.get('profileId'));
	const action = String(form.get('action') ?? '');
	const next = String(form.get('next') ?? '/dashboard/admin/profiles');
	if (!profileId) redirect(303, next);

	if (action === 'deactivate') {
		// Reversible suspend: hides the profile from the public + roster until reactivated.
		await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, profileId));
	} else if (action === 'activate') {
		await db.update(users).set({ deletedAt: null }).where(eq(users.id, profileId));
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
	}

	redirect(303, next);
};
