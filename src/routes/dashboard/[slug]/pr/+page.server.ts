import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// PR desk merged into News (mentions are now a filter there).
export const load: PageServerLoad = async (event) => {
	redirect(302, `/dashboard/${event.params.slug}/posts?filter=mentions`);
};
