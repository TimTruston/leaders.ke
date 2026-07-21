// Ambassador workspace for one campaign, a tab on the CITIZEN view (an ambassador
// is a citizen with extra duties — no separate mode/route family). Scoped hard to
// the viewer's own recruits (followers.addedBy = me); the full roster stays a
// manager concern on /dashboard/[slug]/followers.
import { error, fail, redirect } from '@sveltejs/kit';
import { requireDashboardUser } from '$lib/server/dashboard';
import {
	addCitizenFollower,
	leaveAmbassadorRole,
	listAmbassadorAssignments,
	listRecruits
} from '$lib/server/ambassador';
import { getPageSize } from '$lib/server/settings';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { domainUser } = await requireDashboardUser(event);
	const subjectId = Number(event.params.subjectId);

	const assignments = await listAmbassadorAssignments(domainUser.id);
	const assignment = assignments.find((a) => a.subjectId === subjectId);
	if (!assignment) error(404, 'You are not an ambassador for this campaign.');

	const pageSize = await getPageSize();
	const page = Math.max(1, Number(event.url.searchParams.get('page') ?? 1));
	const { recruits, total } = await listRecruits(domainUser.id, subjectId, page, pageSize);

	return { assignment, recruits, total, page, pageSize };
};

export const actions: Actions = {
	addFollower: async (event) => {
		const { domainUser } = await requireDashboardUser(event);
		const subjectId = Number(event.params.subjectId);
		const assignments = await listAmbassadorAssignments(domainUser.id);
		if (!assignments.some((a) => a.subjectId === subjectId)) {
			return fail(403, { error: 'You can only add citizens to campaigns you mobilize for.' });
		}

		const form = await event.request.formData();
		const result = await addCitizenFollower(domainUser.id, subjectId, {
			name: String(form.get('name') ?? ''),
			phone: String(form.get('phone') ?? ''),
			email: String(form.get('email') ?? ''),
			county: String(form.get('county') ?? '').trim() || null,
			ward: String(form.get('ward') ?? '').trim() || null
		});
		if (!result.ok) return fail(400, { error: result.error });
		return { added: { name: result.name } };
	},

	leave: async (event) => {
		const { domainUser } = await requireDashboardUser(event);
		const form = await event.request.formData();
		const ambassadorId = Number(form.get('ambassadorId') ?? 0);
		if (!ambassadorId) return fail(400, { error: 'Invalid request.' });

		await leaveAmbassadorRole(ambassadorId, domainUser.id);
		redirect(302, '/dashboard');
	}
};
