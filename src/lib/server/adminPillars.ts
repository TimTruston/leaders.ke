// Admin "Pillars" tab: onboarding.md's admin dashboard, pillar management. This is
// a catalog of manifesto starting points per office level (President, Governor, ...),
// not per-candidate — a candidate picks one on their Campaign tab's manifesto
// section to prefill their own pillar's title/summary, or writes a custom one.
// Picking a template doesn't link back to it; it's just a draft starting point.
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { pillarTemplates } from '$lib/server/db/schema';

export const LEVELS = [
	{ slug: 'president', title: 'President' },
	{ slug: 'governor', title: 'Governor' },
	{ slug: 'senator', title: 'Senator' },
	{ slug: 'mp', title: 'MP' },
	{ slug: 'woman-rep', title: 'Woman Rep' },
	{ slug: 'mca', title: 'MCA' }
] as const;

export type LevelSlug = (typeof LEVELS)[number]['slug'];

export function levelTitle(slug: string): string | null {
	return LEVELS.find((l) => l.slug === slug)?.title ?? null;
}

export type PillarTemplateRow = { id: number; title: string; summary: string };

/** Every template for a given office level, e.g. "Governor" — used both by the
 * admin catalog page and the candidate's manifesto picker. */
export async function listTemplatesForLevel(positionTitle: string): Promise<PillarTemplateRow[]> {
	const rows = await db
		.select({ id: pillarTemplates.id, title: pillarTemplates.title, summary: pillarTemplates.summary })
		.from(pillarTemplates)
		.where(and(eq(pillarTemplates.positionTitle, positionTitle), isNull(pillarTemplates.deletedAt)))
		.orderBy(asc(pillarTemplates.id));
	return rows;
}

export async function addTemplate(positionTitle: string, title: string, summary: string) {
	await db.insert(pillarTemplates).values({ positionTitle, title, summary });
}

export async function updateTemplate(id: number, positionTitle: string, title: string, summary: string) {
	await db
		.update(pillarTemplates)
		.set({ title, summary, updatedAt: new Date() })
		.where(and(eq(pillarTemplates.id, id), eq(pillarTemplates.positionTitle, positionTitle)));
}

export async function removeTemplate(id: number, positionTitle: string) {
	await db
		.update(pillarTemplates)
		.set({ deletedAt: new Date() })
		.where(and(eq(pillarTemplates.id, id), eq(pillarTemplates.positionTitle, positionTitle)));
}
