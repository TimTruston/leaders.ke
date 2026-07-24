// The Knowledge tab (/dashboard/[slug]/knowledge) — what a verified team curates to
// ground the AI Chat feature's answers (see $lib/server/ai.ts): an FAQ builder plus
// source-document uploads. Verified-only (unlike every other manager tab, which is
// always reachable regardless of verification — see the comment on `sections` in
// dashboard/+layout.svelte) because the AI only ever answers on a leader's PUBLIC
// profile, which itself only exists once verified. Each add/remove saves
// immediately, same convention as the Delivery tab.
import { fail } from '@sveltejs/kit';
import { and, asc, count, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { faqEntries, knowledgeDocuments } from '$lib/server/db/schema';
import { requireLeader } from '$lib/server/dashboard';
import { redirectWithFlash } from '$lib/server/flash';
import { saveKnowledgeDocument } from '$lib/server/storage';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { ctx } = await requireLeader(event);
	if (!ctx.verified) redirectWithFlash(event.cookies, '../profile', 'The Knowledge tab unlocks once your profile is verified.');

	const [faqRows, documentRows] = await Promise.all([
		db
			.select({ id: faqEntries.id, question: faqEntries.question, answer: faqEntries.answer })
			.from(faqEntries)
			.where(and(eq(faqEntries.subjectUserId, ctx.profileUser.id), isNull(faqEntries.deletedAt)))
			.orderBy(asc(faqEntries.sortOrder), asc(faqEntries.id)),
		db
			.select({ id: knowledgeDocuments.id, title: knowledgeDocuments.title, fileUrl: knowledgeDocuments.fileUrl, mimeType: knowledgeDocuments.mimeType, hasText: knowledgeDocuments.extractedText })
			.from(knowledgeDocuments)
			.where(and(eq(knowledgeDocuments.subjectUserId, ctx.profileUser.id), isNull(knowledgeDocuments.deletedAt)))
			.orderBy(asc(knowledgeDocuments.id))
	]);

	return {
		faqs: faqRows,
		documents: documentRows.map((d) => ({ id: d.id, title: d.title, fileUrl: d.fileUrl, mimeType: d.mimeType, textReady: !!d.hasText }))
	};
};

export const actions: Actions = {
	addFaq: async (event) => {
		const { ctx } = await requireLeader(event);
		if (!ctx.verified) return fail(400, { error: 'Verify your profile first.' });
		const form = await event.request.formData();
		const question = String(form.get('question') ?? '').trim();
		const answer = String(form.get('answer') ?? '').trim();
		if (!question) return fail(400, { error: 'Every FAQ needs a question.' });
		if (!answer) return fail(400, { error: 'Every FAQ needs an answer.' });
		if (question.length > 500) return fail(400, { error: 'Keep the question under 500 characters.' });

		const [{ n }] = await db
			.select({ n: count() })
			.from(faqEntries)
			.where(and(eq(faqEntries.subjectUserId, ctx.profileUser.id), isNull(faqEntries.deletedAt)));
		await db.insert(faqEntries).values({ subjectUserId: ctx.profileUser.id, question, answer, sortOrder: n });
		return { saved: true };
	},

	removeFaq: async (event) => {
		const { ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const id = Number(form.get('id') ?? 0);
		if (!id) return fail(400, { error: 'Nothing to remove.' });
		await db.update(faqEntries).set({ deletedAt: new Date() }).where(and(eq(faqEntries.id, id), eq(faqEntries.subjectUserId, ctx.profileUser.id)));
		return { saved: true };
	},

	uploadDocument: async (event) => {
		const { ctx } = await requireLeader(event);
		if (!ctx.verified) return fail(400, { error: 'Verify your profile first.' });
		const form = await event.request.formData();
		const title = String(form.get('title') ?? '').trim();
		const file = form.get('file');
		if (!title) return fail(400, { error: 'Give the document a title.' });
		if (!(file instanceof File) || file.size === 0) return fail(400, { error: 'Choose a file to upload.' });

		try {
			const { fileUrl, extractedText } = await saveKnowledgeDocument(ctx.profileUser.id, file);
			await db.insert(knowledgeDocuments).values({ subjectUserId: ctx.profileUser.id, title, fileUrl, mimeType: file.type, extractedText });
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Upload failed.' });
		}
		return { saved: true };
	},

	removeDocument: async (event) => {
		const { ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const id = Number(form.get('id') ?? 0);
		if (!id) return fail(400, { error: 'Nothing to remove.' });
		await db.update(knowledgeDocuments).set({ deletedAt: new Date() }).where(and(eq(knowledgeDocuments.id, id), eq(knowledgeDocuments.subjectUserId, ctx.profileUser.id)));
		return { saved: true };
	}
};
