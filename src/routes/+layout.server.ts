import type { LayoutServerLoad } from './$types';

// Expose the session user to every page so the Header can switch Log in / Log out,
// plus the one-shot flash notice (consumed by hooks) for whichever page renders it.
export const load: LayoutServerLoad = ({ locals, url }) => {
	// Reference the URL so this load re-runs on every client-side navigation —
	// otherwise a flash set during a redirect is consumed by hooks but never
	// reaches the banner (stale `flash: null` from the previous navigation).
	void url.pathname;
	return { user: locals.user ?? null, flash: locals.flash ?? null };
};
