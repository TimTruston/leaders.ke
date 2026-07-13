import { redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

// No UI: visiting /logout directly signs out and bounces home. A plain <a href="/logout">
// works off this load function (a click is a GET navigation) — callers MUST disable
// SvelteKit's hover preload on that link (data-sveltekit-preload-data="off"), since
// preloading would otherwise sign the user out just by hovering. The POST action
// below is what Header.svelte's logout form uses instead.
export const load: PageServerLoad = async (event) => {
	await auth.api.signOut({ headers: event.request.headers });
	redirect(302, '/');
};

export const actions: Actions = {
	default: async (event) => {
		await auth.api.signOut({ headers: event.request.headers });
		return redirect(302, '/');
	}
};
