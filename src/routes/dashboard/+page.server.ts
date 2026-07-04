import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const authUser = event.locals.user;
	if (!authUser) redirect(302, '/login');

	// The domain profile holds firstName/otherNames/verifiedAt; bridged to the auth user by authUserId.
	const [profile] = await db.select().from(users).where(eq(users.authUserId, authUser.id));

	return {
		firstName: profile?.firstName ?? authUser.name ?? 'there',
		verifiedAt: profile?.verifiedAt ?? null,
		email: authUser.email
	};
};
