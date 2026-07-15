import { fail } from '@sveltejs/kit';
import { requireDashboardUser } from '$lib/server/dashboard';
import {
	addCitizenFollower,
	isActiveAmbassador,
	leaveAmbassadorRole,
	listAmbassadorAssignments,
	listRecruits
} from '$lib/server/ambassador';
import { getPageSize } from '$lib/server/settings';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { domainUser } = await requireDashboardUser(event);
	const pageSize = await getPageSize();

	// ?leader=<id>&page=<n> pages one campaign's recruit roster; the other
	// campaigns stay on page 1 (an ambassador rarely serves more than a couple).
	const pagedLeaderId = Number(event.url.searchParams.get('leader') ?? 0);
	const page = Math.max(1, Number(event.url.searchParams.get('page') ?? 1));

	const assignments = await listAmbassadorAssignments(domainUser.id);
	const rosters = await Promise.all(
		assignments.map(async (a) => {
			const recruitPage = a.leaderId === pagedLeaderId ? page : 1;
			const { recruits, total } = await listRecruits(domainUser.id, a.leaderId, recruitPage, pageSize);
			return { leaderId: a.leaderId, recruits, total, page: recruitPage };
		})
	);

	return { assignments, rosters, pageSize };
};

export const actions: Actions = {
	leave: async (event) => {
		const { domainUser } = await requireDashboardUser(event);
		const form = await event.request.formData();
		const ambassadorId = Number(form.get('ambassadorId') ?? 0);
		if (!ambassadorId) return fail(400, { error: 'Invalid request.' });

		await leaveAmbassadorRole(ambassadorId, domainUser.id);
		return { left: true };
	},

	addFollower: async (event) => {
		const { domainUser } = await requireDashboardUser(event);
		const form = await event.request.formData();
		const leaderId = Number(form.get('leaderId') ?? 0);
		if (!leaderId || !(await isActiveAmbassador(domainUser.id, leaderId))) {
			return fail(403, { error: 'You can only add citizens to campaigns you mobilize for.' });
		}

		const result = await addCitizenFollower(domainUser.id, leaderId, {
			name: String(form.get('name') ?? ''),
			contact: String(form.get('contact') ?? ''),
			county: String(form.get('county') ?? '').trim() || null,
			ward: String(form.get('ward') ?? '').trim() || null
		});
		if (!result.ok) return fail(400, { error: result.error });
		return { added: { name: result.name, leaderId } };
	}
};
