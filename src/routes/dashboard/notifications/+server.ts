import { redirect } from '@sveltejs/kit';
import { requireDashboardUser } from '$lib/server/dashboard';
import { markNotificationsRead } from '$lib/server/notifications';
import type { RequestHandler } from './$types';

// Dismisses one dashboard notification banner (marks it read). A plain form POST
// so it works without JS; the redirect returns to the page the banner was on.
export const POST: RequestHandler = async (event) => {
	const { domainUser } = await requireDashboardUser(event);
	const form = await event.request.formData();
	const id = Number(form.get('id'));
	if (Number.isInteger(id)) await markNotificationsRead(domainUser.id, [id]);

	const back = event.request.headers.get('referer');
	// Only bounce back to same-origin paths; anything else lands on the dashboard.
	const path = back && new URL(back).origin === event.url.origin ? new URL(back).pathname : '/dashboard';
	redirect(303, path);
};
