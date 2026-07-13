import { fail } from '@sveltejs/kit';
import { requireDashboardUser } from '$lib/server/dashboard';
import { acceptInvite, listInvitesForEmail } from '$lib/server/invites';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { authUser } = await requireDashboardUser(event);
	return { invites: await listInvitesForEmail(authUser.email) };
};

export const actions: Actions = {
	accept: async (event) => {
		const { domainUser, authUser } = await requireDashboardUser(event);
		const form = await event.request.formData();
		const token = String(form.get('token') ?? '');
		if (!token) return fail(400, { error: 'Invalid invite.' });

		const result = await acceptInvite(token, domainUser.id, authUser.email);
		if (!result.ok) return fail(400, { error: result.error });

		return { accepted: true, role: result.role };
	}
};
