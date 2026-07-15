// Seeds the single platform_settings row (id=1). Idempotent: a fresh DB gets the
// column defaults; an existing row keeps every admin-tuned value and only has the
// default blocked slugs unioned in, so new route words propagate on reseed without
// dropping words an admin added.
import { eq } from 'drizzle-orm';
import { platformSettings, DEFAULT_BLOCKED_SLUGS } from '../../src/lib/server/db/schema';
import type { AnyDb } from './names';

export async function seedPlatformSettings(db: AnyDb) {
	const [existing] = await db.select().from(platformSettings).where(eq(platformSettings.id, 1));

	if (!existing) {
		await db.insert(platformSettings).values({ id: 1 });
		console.log('[platform-settings] seeded defaults (blocked slugs included)');
		return;
	}

	const blockedSlugs = [...new Set([...existing.blockedSlugs, ...DEFAULT_BLOCKED_SLUGS])];
	if (blockedSlugs.length !== existing.blockedSlugs.length) {
		await db
			.update(platformSettings)
			.set({ blockedSlugs, updatedAt: new Date() })
			.where(eq(platformSettings.id, 1));
		console.log(`[platform-settings] backfilled ${blockedSlugs.length - existing.blockedSlugs.length} default blocked slug(s)`);
	} else {
		console.log('[platform-settings] up to date');
	}
}
