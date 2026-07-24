// Serves Knowledge-tab source documents (see knowledgeDocuments in schema.ts) from
// local disk. Never public — these feed the AI's grounding context, not the profile
// page — so only an active manager of the person, the person themself, or a
// platform admin may fetch one.
import { error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { managers } from '$lib/server/db/schema';
import { requireDashboardUser } from '$lib/server/dashboard';
import type { RequestHandler } from './$types';

const EXT_CONTENT_TYPE: Record<string, string> = {
	pdf: 'application/pdf',
	txt: 'text/plain',
	md: 'text/markdown'
};

export const GET: RequestHandler = async (event) => {
	const subjectUserId = Number(event.params.subjectUserId);
	const filename = event.params.filename;
	if (!subjectUserId || !filename || /[/\\]/.test(filename) || filename.includes('..')) {
		error(404, 'Not found');
	}

	const { domainUser } = await requireDashboardUser(event);
	if (!domainUser.adminAt && domainUser.id !== subjectUserId) {
		const [membership] = await db
			.select({ id: managers.id })
			.from(managers)
			.where(and(eq(managers.userId, domainUser.id), eq(managers.subjectUserId, subjectUserId), isNull(managers.deletedAt)));
		if (!membership) error(403, 'Not authorized to view this document.');
	}

	const localDir = env.STORAGE_LOCAL_DIR || '.uploads';
	const filePath = path.join(process.cwd(), localDir, 'knowledge', String(subjectUserId), filename);

	let buffer: Buffer;
	try {
		buffer = await readFile(filePath);
	} catch {
		error(404, 'Not found');
	}

	const ext = filename.split('.').pop()?.toLowerCase() ?? '';
	return new Response(new Uint8Array(buffer), {
		headers: {
			'content-type': EXT_CONTENT_TYPE[ext] ?? 'application/octet-stream',
			'cache-control': 'private, no-store'
		}
	});
};
