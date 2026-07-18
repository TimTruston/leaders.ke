import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// The ranking lives at /rank/[position] (one page per office); old /ranks links
// land on the top of the hierarchy.
export const load: PageServerLoad = async () => {
	redirect(301, '/rank/presidents');
};
