import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public'; // PUBLIC_-prefixed vars live here, not in private
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { users, contacts } from '$lib/server/db/schema';
import { sendEmail } from '$lib/server/email';

export const auth = betterAuth({
	baseURL: publicEnv.PUBLIC_BASE_URL,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'pg' }),
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
	// immediately). Verification itself happens on /verify via OTP (see
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
		// No changeEmail block: /change-email runs entirely on our own OTP flow
		// ($lib/server/otp.ts) instead of better-auth's built-in one — its JWT
		// links were long, and confirming triggered a second, unrelated
		// "verify your email" email via better-auth's own auto-reverification.
		// No sendDeleteAccountVerification, so deleteUser deletes immediately after the password check. Powers /delete-account.
		deleteUser: { enabled: true }
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
							otherNames: rest.join(' ') || 'User'
						})
						.returning();

					if (authUser.email) {
						await db.insert(contacts).values({
							userId: profile.id,
							channel: 'email',
							value: authUser.email,
							isPrimary: true,
							verifiedAt: authUser.emailVerified ? new Date() : null
						});
					}
				}
			}
		}
	},
	plugins: [
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});
