// Platform-wide, admin-tunable settings — single row, id=1. No caching: this is
// read on every OTP/invite send, but those are low-frequency, human-paced actions.
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { platformSettings } from '$lib/server/db/schema';

export type PlatformSettings = typeof platformSettings.$inferSelect;

export async function getPlatformSettings(): Promise<PlatformSettings> {
	const [row] = await db.select().from(platformSettings).where(eq(platformSettings.id, 1));
	if (row) return row;
	// Row should always exist (seeded by migration) — recreate defensively if it's ever missing.
	const [created] = await db.insert(platformSettings).values({ id: 1 }).returning();
	return created;
}

/** Rows per page on every paginated dashboard list (campaign, admin, and citizen tabs). */
export async function getPageSize(): Promise<number> {
	return (await getPlatformSettings()).pageSize;
}
