// Seeds the admin pillar-template catalog from src/lib/data/pillar-templates.json
// (docs/Pillars.md, broken into one row per level/title). Mirrors the
// `pillar_templates` table — no leader/campaign dependency, so this can run any time.
import { and, eq, isNull } from 'drizzle-orm';
import { pillarTemplates } from '../../src/lib/server/db/schema';
import type { AnyDb } from './names';
import templatesData from '../../src/lib/data/pillar-templates.json';

type TemplateRow = { positionTitle: string; title: string; summary: string };

export async function seedPillarTemplates(db: AnyDb) {
	const rows = templatesData as TemplateRow[];
	if (rows.length === 0) {
		console.log('[pillar-templates] no rows in pillar-templates.json, skipping');
		return;
	}

	let seeded = 0;
	let skipped = 0;

	for (const row of rows) {
		const [existing] = await db
			.select({ id: pillarTemplates.id })
			.from(pillarTemplates)
			.where(
				and(
					eq(pillarTemplates.positionTitle, row.positionTitle),
					eq(pillarTemplates.title, row.title),
					isNull(pillarTemplates.deletedAt)
				)
			);
		if (existing) {
			skipped++;
			continue;
		}

		await db.insert(pillarTemplates).values(row);
		seeded++;
	}

	console.log(`[pillar-templates] seeded ${seeded}, skipped ${skipped} already-seeded`);
}
