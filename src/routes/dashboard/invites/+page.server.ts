import { fail, redirect } from '@sveltejs/kit';
import { requireDashboardUser } from '$lib/server/dashboard';
import { acceptInvite, inviteDestination, joinedBannerQuery, listInvitesForEmail } from '$lib/server/invites';
import { getPageSize } from '$lib/server/settings';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { authUser } = await requireDashboardUser(event);
	const pageSize = await getPageSize();
	const page = Math.max(1, Number(event.url.searchParams.get('page') ?? 1));
	const { invites, total } = await listInvitesForEmail(authUser.email, page, pageSize);
	return { invites, total, page, pageSize };
};

export const actions: Actions = {
	accept: async (event) => {
		const { domainUser, authUser } = await requireDashboardUser(event);
		const form = await event.request.formData();
		const token = String(form.get('token') ?? '');
		if (!token) return fail(400, { error: 'Invalid invite.' });

		const result = await acceptInvite(token, domainUser.id, authUser.email);
		if (!result.ok) return fail(400, { error: result.error });

		redirect(302, `${inviteDestination(result.role, result.dashboardBase, result.leaderId)}?${joinedBannerQuery(result.role, result.leaderName)}`);
	}
};
