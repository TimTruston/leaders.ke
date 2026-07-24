import { redirect, type Cookies } from '@sveltejs/kit';
import { requireDashboardUser } from '$lib/server/dashboard';
import { setFlash } from '$lib/server/flash';
import { getPlatformSettings } from '$lib/server/settings';
import type { LayoutServerLoad } from './$types';

// Queues this gate's message on TOP of any flash already staged (e.g. "That number
// is already verified on another account." from a failed OTP attempt one redirect
// back) instead of overwriting it. hooks.server.ts already CONSUMES the flash cookie
// into event.locals.flash before this load runs (it isn't peeked outside /login and
// /signup) — re-reading the cookie here would always find it empty, so the existing
// message must come from locals, not another readFlash call.
function stackFlash(cookies: Cookies, existing: string | null | undefined, path: string, message: string): never {
	// Specific reason on top, this gate's generic instruction below — rendered as two
	// lines (see the flash banner's whitespace-pre-line) rather than one run-on sentence.
	setFlash(cookies, existing ? `${existing}\n${message}` : message);
	redirect(302, path);
}

// Gates the whole onboarding wizard: signed in, and (when the admin Settings
// page's onboarding verification gate requires it) both email + phone verified
// (OTP) — the "Claim this profile" button and the citizen dashboard CTA both land
// here first. An unauthenticated visitor round-trips through login/signup via
// ?next so they come straight back to the onboard URL they clicked (preserving
// e.g. ?profile=<slug> on the claim path).
export const load: LayoutServerLoad = async (event) => {
	if (!event.locals.user) {
		redirect(302, `/login?next=${encodeURIComponent(event.url.pathname + event.url.search)}`);
	}
	const { domainUser } = await requireDashboardUser(event);
	const settings = await getPlatformSettings();

	// Arrived via "Claim this profile" (?profile=<slug> on /onboard/profile) vs the
	// citizen dashboard's "Create Your Profile" CTA — only the wording differs.
	const claiming = !!event.url.searchParams.get('profile');
	// Carries this onboard URL as ?next= so EmailInput/PhoneInput's "Verify" link
	// (which reads the CURRENT page's own ?next before falling back to its pathname)
	// chases it after a successful OTP, instead of stranding the citizen on
	// /dashboard/account.
	const accountPath = `/dashboard/account?next=${encodeURIComponent(event.url.pathname + event.url.search)}`;
	if (settings.requireEmailVerification && !domainUser.verified?.email) {
		stackFlash(event.cookies, event.locals.flash, accountPath, `Verify your email to allow you to ${claiming ? 'claim' : 'create'} a Leader's Profile.`);
	}
	if (settings.requirePhoneVerification && !domainUser.verified?.sms) {
		stackFlash(event.cookies, event.locals.flash, accountPath, `Verify your phone number to allow you to ${claiming ? 'claim' : 'create'} a Leader's Profile.`);
	}

	return {};
};
