import { redirect } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/dashboard';
import { LEVELS } from '$lib/server/adminPillars';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	await requireAdmin(event);
	redirect(302, `/dashboard/admin/pillars/${LEVELS[0].slug}`);
};
