import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { followers } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

// Public confirm link an email-follow's confirmation email sends (see the
// `follow` action on [leader]/[year]/+page.server.ts). The token is never
// cleared after confirming, so re-visiting an already-used link is a harmless
// idempotent no-op ("already confirmed"), not a broken/invalid one.
export const load: PageServerLoad = async ({ params }) => {
	const [row] = await db
		.select({ id: followers.id, name: followers.name, confirmedAt: followers.confirmedAt })
		.from(followers)
		.where(and(eq(followers.confirmToken, params.token), isNull(followers.deletedAt)));

	if (!row) return { status: 'invalid' as const };

	if (!row.confirmedAt) {
		await db.update(followers).set({ confirmedAt: new Date() }).where(eq(followers.id, row.id));
	}

	return { status: 'confirmed' as const, name: row.name };
};
