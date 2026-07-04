import type { LayoutServerLoad } from './$types';

// Expose the session user to every page so the Header can switch Log in / Log out.
export const load: LayoutServerLoad = ({ locals }) => {
	return { user: locals.user ?? null };
};
