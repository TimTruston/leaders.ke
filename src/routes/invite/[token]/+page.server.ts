import { redirect } from '@sveltejs/kit';
import { getDomainUser } from '$lib/server/leader';
import { acceptInvite, emailHasAccount, getInviteByToken } from '$lib/server/invites';
import type { PageServerLoad } from './$types';

// Where each accepted role actually lands: bare /dashboard is always citizen mode
// (see dashboard/+layout.svelte's mode detection), so managers/ambassadors need a
// route that's unambiguously campaign-mode instead of bouncing to the citizen view.
function destinationFor(role: 'manager' | 'ambassador' | 'follower'): string {
	if (role === 'manager') return '/dashboard/profile';
	if (role === 'ambassador') return '/dashboard/ambassador';
	return '/dashboard';
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const invite = await getInviteByToken(params.token);

	// Signed out: send them to sign in/up first, remembering to come straight back
	// here. Route to whichever of login/signup actually applies for this email, and
	// lock the email field there — otherwise someone can sign up with a different
	// address and only discover the mismatch later.
	if (!locals.user) {
		const next = encodeURIComponent(`/invite/${params.token}`);
		if (invite) {
			const hasAccount = await emailHasAccount(invite.email);
			const dest = hasAccount ? 'login' : 'signup';
			redirect(302, `/${dest}?next=${next}&email=${encodeURIComponent(invite.email)}`);
		}
		redirect(302, `/login?next=${next}`);
	}

	if (!invite) return { error: 'This invite link has already been used, revoked, or expired.' };

	// Clicking the emailed link is the acceptance — no separate "Accept" click needed.
	const domainUser = await getDomainUser(locals.user.id);
	if (!domainUser) return { error: 'Sign in first.' };

	const result = await acceptInvite(params.token, domainUser.id, locals.user.email);
	if (!result.ok) return { error: result.error };

	redirect(302, destinationFor(result.role));
};
