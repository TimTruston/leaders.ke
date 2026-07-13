import { fail } from '@sveltejs/kit';
import { requireDashboardUser } from '$lib/server/dashboard';
import { leaveAmbassadorRole, listAmbassadorAssignments } from '$lib/server/ambassador';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { domainUser } = await requireDashboardUser(event);
	return { assignments: await listAmbassadorAssignments(domainUser.id) };
};

export const actions: Actions = {
	leave: async (event) => {
		const { domainUser } = await requireDashboardUser(event);
		const form = await event.request.formData();
		const ambassadorId = Number(form.get('ambassadorId') ?? 0);
		if (!ambassadorId) return fail(400, { error: 'Invalid request.' });

		await leaveAmbassadorRole(ambassadorId, domainUser.id);
		return { left: true };
	}
};
