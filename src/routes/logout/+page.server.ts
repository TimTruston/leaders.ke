import { redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

// No UI: visiting /logout directly just bounces home. Sign out happens via the POST action.
export const load: PageServerLoad = () => redirect(302, '/');

export const actions: Actions = {
	default: async (event) => {
		await auth.api.signOut({ headers: event.request.headers });
		return redirect(302, '/');
	}
};
