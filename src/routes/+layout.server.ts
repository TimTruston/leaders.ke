import type { LayoutServerLoad } from './$types';

// Expose the session user to every page so the Header can switch Log in / Log out,
// plus the one-shot flash notice (consumed by hooks) for whichever page renders it.
export const load: LayoutServerLoad = ({ locals }) => {
	return { user: locals.user ?? null, flash: locals.flash ?? null };
};
