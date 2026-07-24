// Feeds the Knowledge tab's FAQ entries and extracted document text into the AI
// Chat feature's grounding context (see $lib/server/ai.ts). One shared helper so
// every public page that asks the AI a question (leader profile, campaign
// workspace, admin preview) pulls the exact same extras the same way.
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { faqEntries, knowledgeDocuments } from '$lib/server/db/schema';

export async function getGroundingExtras(subjectUserId: number) {
	const [faqRows, docRows] = await Promise.all([
		db
			.select({ question: faqEntries.question, answer: faqEntries.answer })
			.from(faqEntries)
			.where(and(eq(faqEntries.subjectUserId, subjectUserId), isNull(faqEntries.deletedAt)))
			.orderBy(asc(faqEntries.sortOrder), asc(faqEntries.id)),
		db
			.select({ title: knowledgeDocuments.title, extractedText: knowledgeDocuments.extractedText })
			.from(knowledgeDocuments)
			.where(and(eq(knowledgeDocuments.subjectUserId, subjectUserId), isNull(knowledgeDocuments.deletedAt)))
	]);
	return {
		faqs: faqRows,
		// Only documents with extracted text are useful grounding — a PDF still
		// pending text extraction (see saveKnowledgeDocument) has nothing to quote.
		documents: docRows
			.filter((d): d is { title: string; extractedText: string } => !!d.extractedText)
			.map((d) => ({ title: d.title, text: d.extractedText }))
	};
}
