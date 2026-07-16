import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public'; // PUBLIC_-prefixed vars live here, not in private
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { users, contacts } from '$lib/server/db/schema';
import { sendEmail } from '$lib/server/email';

// "Continue with Google" only lights up when both OAuth credentials are set —
// dev without keys stays on email/password, and the login/signup pages hide the
// button (they read this flag).
export const googleAuthEnabled = !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET;

export const auth = betterAuth({
	baseURL: publicEnv.PUBLIC_BASE_URL,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'pg' }),
	...(googleAuthEnabled
		? { socialProviders: { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } } }
		: {}),
	emailAndPassword: {
		enabled: true,
		// Emails the reset link (via Postmark, or the console stub in dev). Powers /forgot-password.
		sendResetPassword: async ({ user, url }) => {
			await sendEmail({
				to: user.email,
				subject: 'Reset your leaders.ke password',
				text: `Hi ${user.name || 'there'},\n\nReset your password with this link (valid for a limited time):\n${url}\n\nDidn't request it? Ignore this email — your password stays the same.`
			});
		}
	},
	// No requireEmailVerification, so signup stays frictionless (you're signed in
	// immediately). Verification itself happens on /verify/email via OTP (see
	// $lib/server/otp.ts), not this link — no sendOnSignUp, so that's the only email sent.
	emailVerification: {
		sendOnSignUp: false,
		sendVerificationEmail: async ({ user, url }) => {
			await sendEmail({
				to: user.email,
				subject: 'Verify your leaders.ke email',
				text: `Hi ${user.name || 'there'},\n\nVerify your email with this link:\n${url}\n\nDidn't sign up? Ignore this email.`
			});
		}
	},
	user: {
		// No change-email route. Email verification is done inline using our own OTP flow ($lib/server/otp.ts)
		// better-auth's built-in one had too long JWT links, and confirming triggered a second, unrelated
		// "verify your email" email via better-auth's own auto-reverification.
		// No sendDeleteAccountVerification, so deleteUser deletes immediately after the password check. Powers /delete-account.
		deleteUser: { enabled: true }
	},
	// Link Google to an existing account with the same email instead of erroring or
	// making a duplicate. Google is trusted (it verifies emails), so the link is
	// automatic — someone who signed up with email/password can later "Sign in with
	// Google" and land on the same account.
	account: {
		accountLinking: {
			enabled: true,
			trustedProviders: ['google']
		}
	},
	databaseHooks: {
		user: {
			create: {
				// Bridge each new auth account to a domain profile + an email contact.
				// firstName/otherNames are seeded from the signup name (OAuth path); the email
				// signup action overrides them with the exact form values.
				after: async (authUser) => {
					const [first, ...rest] = (authUser.name ?? '').trim().split(/\s+/);
					const [profile] = await db
						.insert(users)
						.values({
							authUserId: authUser.id,
							firstName: first || 'New',
							otherNames: rest.join(' ') || 'User',
							// Google (and any OAuth provider) hands us a pre-verified email, so
							// skip the OTP step for those; email/password signups arrive
							// unverified (emailVerified false) and still verify on /verify/email.
							verified: { email: !!authUser.emailVerified, sms: false, whatsapp: false }
						})
						.returning();

					if (authUser.email) {
						// onConflictDoNothing: the same email can already be live as some other
						// user's contacts row (e.g. a leader profile's own public contact
						// address) — that's a separate concern from this account's login email,
						// so just skip the redundant contacts row rather than failing signup
						// over the shared unique index. This citizen still gets a working
						// login; their own email-verified state is tracked on `users.verified`
						// and better-auth's `user.emailVerified`, not this row.
						await db
							.insert(contacts)
							.values({
								userId: profile.id,
								channel: 'email',
								value: authUser.email,
								isPrimary: true,
								verifiedAt: authUser.emailVerified ? new Date() : null
							})
							.onConflictDoNothing();
					}
				}
			}
		}
	},
	plugins: [
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});
