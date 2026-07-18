import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// The directory lives on the per-position pages now (/presidents, /governors,
// ...); old /leaders links land on the top of the hierarchy.
export const load: PageServerLoad = async () => {
	redirect(301, '/presidents');
};
