// One-shot notice banners passed between requests via a cookie instead of the URL.
// ?notice= was spoofable (anyone could craft a link rendering arbitrary text inside
// our UI) and leaked into shareable/bookmarked links. Set right before a redirect;
// hooks.server.ts reads it into locals.flash on the next request and consumes it.
import { redirect, type Cookies } from '@sveltejs/kit';

const FLASH_COOKIE = 'flash';

/** Queues a notice for the next page load. Call right before redirect(). */
export function setFlash(cookies: Cookies, message: string) {
	cookies.set(FLASH_COOKIE, message, { path: '/', maxAge: 60, httpOnly: true, sameSite: 'lax' });
}

/** Queues the notice and redirects — the flash replacement for the old ?notice= URLs. */
export function redirectWithFlash(cookies: Cookies, path: string, message: string): never {
	setFlash(cookies, message);
	redirect(302, path);
}

/** Reads and (normally) consumes the flash. `peek` leaves the cookie in place —
 * used on login/signup so the banner survives switching between the two forms;
 * their actions clear it on success (see clearFlash). */
export function readFlash(cookies: Cookies, opts: { peek?: boolean } = {}): string | null {
	const message = cookies.get(FLASH_COOKIE) ?? null;
	if (message && !opts.peek) cookies.delete(FLASH_COOKIE, { path: '/' });
	return message;
}

/** Drops a peeked flash — called on successful login/signup so a pre-auth notice
 * (e.g. "You need to be logged in…") can't resurface after authentication. */
export function clearFlash(cookies: Cookies) {
	cookies.delete(FLASH_COOKIE, { path: '/' });
}
