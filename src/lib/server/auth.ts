import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public'; // PUBLIC_-prefixed vars live here, not in private
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { users, contacts } from '$lib/server/db/schema';

export const auth = betterAuth({
	baseURL: publicEnv.PUBLIC_BASE_URL,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'pg' }),
	emailAndPassword: { enabled: true },
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
