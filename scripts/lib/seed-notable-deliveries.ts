// Seeds Delivery-tab starter content (see scripts/data/notable-deliveries.ts) for
// specific notable, already-seeded profiles, all pinned so they surface on the
// public profile immediately. Idempotent: matched by (leaderId, title), and
// respects the same 5-pinned-per-person cap the dashboard's own togglePin action
// enforces — never pins past it, same as a manager using the tab by hand.
import { and, eq, isNull } from 'drizzle-orm';
import { deliveries, leaders, positions, users } from '../../src/lib/server/db/schema';
import { NOTABLE_DELIVERIES } from '../data/notable-deliveries';
import type { AnyDb } from './names';

const MAX_PINNED = 5;

export async function seedNotableDeliveries(db: AnyDb) {
	let added = 0;
	let pinned = 0;

	for (const [slug, { positionTitle, items }] of Object.entries(NOTABLE_DELIVERIES)) {
		const [subject] = await db.select({ id: users.id }).from(users).where(and(eq(users.slug, slug), isNull(users.deletedAt)));
		if (!subject) {
			console.log(`[notable-deliveries] ${slug} not seeded yet, skipping`);
			continue;
		}

		const [term] = await db
			.select({ id: leaders.id })
			.from(leaders)
			.innerJoin(positions, eq(leaders.positionId, positions.id))
			.where(and(eq(leaders.userId, subject.id), eq(positions.title, positionTitle), isNull(leaders.deletedAt)));
		if (!term) {
			console.log(`[notable-deliveries] ${slug} has no ${positionTitle} term yet, skipping`);
			continue;
		}

		const existingRows = await db
			.select({ title: deliveries.title, pinnedAt: deliveries.pinnedAt })
			.from(deliveries)
			.where(and(eq(deliveries.leaderId, term.id), isNull(deliveries.deletedAt)));
		const existingTitles = new Set(existingRows.map((r) => r.title));
		let pinnedCount = existingRows.filter((r) => r.pinnedAt).length;

		for (const item of items) {
			if (existingTitles.has(item.title)) continue;
			const canPin = pinnedCount < MAX_PINNED;
			await db.insert(deliveries).values({
				leaderId: term.id,
				title: item.title,
				description: item.description,
				pinnedAt: canPin ? new Date() : null
			});
			added++;
			if (canPin) {
				pinnedCount++;
				pinned++;
			}
		}

		console.log(`[notable-deliveries] ${slug}: ${items.filter((i) => !existingTitles.has(i.title)).length} added, ${pinnedCount} now pinned`);
	}

	if (added === 0) console.log('[notable-deliveries] up to date');
}
