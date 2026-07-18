import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// /rank on its own means the top of the hierarchy: the presidential ranking.
export const load: PageServerLoad = async () => {
	redirect(302, '/rank/presidents');
};
