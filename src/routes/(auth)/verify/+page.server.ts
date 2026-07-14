import { redirect } from '@sveltejs/kit';
import { requireDashboardUser } from '$lib/server/dashboard';
import type { PageServerLoad } from './$types';

// Only ever redirect to a same-origin relative path — never follow ?next anywhere else.
function safeNext(next: string | null): string {
	return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}
export const load: PageServerLoad = async (event) => {
	const { authUser, domainUser } = await requireDashboardUser(event);
	const next = safeNext(event.url.searchParams.get('next'));
	const emailVerified = domainUser.verified.email;
	if (emailVerified) redirect(302, next);
	redirect(302, `/verify/email?next=${encodeURIComponent(next)}`);
};