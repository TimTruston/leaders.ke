// Seeds Knowledge tab starter content (FAQ + source documents, see
// scripts/data/notable-knowledge.ts) for specific already-seeded, notable profiles —
// so their AI Chat demos convincingly before a real team fills in their own.
// Idempotent: matched by (subjectUserId, question) / (subjectUserId, title), so a
// reseed never duplicates rows, and any slug not yet seeded (e.g. before `scraped`
// has run) is skipped, not created.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';
import { faqEntries, knowledgeDocuments, users } from '../../src/lib/server/db/schema';
import { NOTABLE_KNOWLEDGE } from '../data/notable-knowledge';
import type { AnyDb } from './names';

export async function seedNotableKnowledge(db: AnyDb) {
	let faqsAdded = 0;
	let docsAdded = 0;

	for (const [slug, { faqs, documents }] of Object.entries(NOTABLE_KNOWLEDGE)) {
		const [subject] = await db.select({ id: users.id }).from(users).where(and(eq(users.slug, slug), isNull(users.deletedAt)));
		if (!subject) {
			console.log(`[notable-knowledge] ${slug} not seeded yet, skipping`);
			continue;
		}

		const existingFaqs = await db
			.select({ question: faqEntries.question })
			.from(faqEntries)
			.where(and(eq(faqEntries.subjectUserId, subject.id), isNull(faqEntries.deletedAt)));
		const existingQuestions = new Set(existingFaqs.map((f) => f.question));
		const newFaqs = faqs.filter((f) => !existingQuestions.has(f.question));
		if (newFaqs.length > 0) {
			await db
				.insert(faqEntries)
				.values(newFaqs.map((f, i) => ({ subjectUserId: subject.id, question: f.question, answer: f.answer, sortOrder: existingFaqs.length + i })));
			faqsAdded += newFaqs.length;
		}

		const existingDocs = await db
			.select({ title: knowledgeDocuments.title })
			.from(knowledgeDocuments)
			.where(and(eq(knowledgeDocuments.subjectUserId, subject.id), isNull(knowledgeDocuments.deletedAt)));
		const existingTitles = new Set(existingDocs.map((d) => d.title));
		const newDocs = documents.filter((d) => !existingTitles.has(d.title));
		if (newDocs.length > 0) {
			const localDir = process.env.STORAGE_LOCAL_DIR || '.uploads';
			const dir = path.join(process.cwd(), localDir, 'knowledge', String(subject.id));
			await mkdir(dir, { recursive: true });
			for (const d of newDocs) {
				await writeFile(path.join(dir, d.filename), d.content, 'utf-8');
				await db.insert(knowledgeDocuments).values({
					subjectUserId: subject.id,
					title: d.title,
					fileUrl: `/uploads/knowledge/${subject.id}/${d.filename}`,
					mimeType: 'text/plain',
					extractedText: d.content
				});
			}
			docsAdded += newDocs.length;
		}

		console.log(`[notable-knowledge] ${slug}: ${newFaqs.length} FAQ(s), ${newDocs.length} document(s) added`);
	}

	if (faqsAdded === 0 && docsAdded === 0) console.log('[notable-knowledge] up to date');
}
