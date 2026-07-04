import { redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import type { RequestHandler } from './$types';

// POST-only sign out, posted from the Header. Clears the session then returns home.
export const POST: RequestHandler = async (event) => {
	await auth.api.signOut({ headers: event.request.headers });
	return redirect(302, '/');
};
