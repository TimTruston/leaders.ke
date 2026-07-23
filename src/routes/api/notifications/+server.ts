import { json, error } from '@sveltejs/kit';
import { getDomainUser } from '$lib/server/leader';
import { countUnreadNotifications, listNotifications } from '$lib/server/notifications';
import { getPageSize } from '$lib/server/settings';
import type { RequestHandler } from './$types';

// Lazy-loaded by the Header's notifications panel, on any page — same rationale as
// /api/switcher: paginated history isn't worth fetching on every page view, only
// when the panel is actually opened.
export const GET: RequestHandler = async (event) => {
	if (!event.locals.user) error(401, 'Not signed in.');
	const domainUser = await getDomainUser(event.locals.user.id);
	if (!domainUser) error(401, 'Not signed in.');

	const page = Math.max(1, Number(event.url.searchParams.get('page') ?? 1));
	const pageSize = await getPageSize();
	const [{ items, total }, unreadCount] = await Promise.all([
		listNotifications(domainUser.id, page, pageSize),
		countUnreadNotifications(domainUser.id)
	]);
	return json({ items, total, page, pageSize, unreadCount });
};
