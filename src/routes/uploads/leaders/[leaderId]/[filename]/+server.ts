// Serves campaign-application documents (photo, ID front/back, IEBC certificate)
// from local disk. These are ID scans — never public: only an active manager of
// that leader, or a platform admin, may fetch them.
import { error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { managers } from '$lib/server/db/schema';
import { requireDashboardUser } from '$lib/server/dashboard';
import { personIdForLeader } from '$lib/server/leader';
import type { RequestHandler } from './$types';

const EXT_CONTENT_TYPE: Record<string, string> = {
	jpg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	pdf: 'application/pdf'
};

export const GET: RequestHandler = async (event) => {
	const { domainUser } = await requireDashboardUser(event);

	const leaderId = Number(event.params.leaderId);
	const filename = event.params.filename;
	// No path separators allowed in either segment — blocks directory traversal.
	if (!leaderId || !filename || /[/\\]/.test(filename) || filename.includes('..')) {
		error(404, 'Not found');
	}

	if (!domainUser.adminAt) {
		// The URL names a candidacy term; access is granted to a manager of the person
		// behind it (managers attach to the person, not the term).
		const subjectUserId = await personIdForLeader(leaderId);
		const [membership] = subjectUserId
			? await db
					.select({ id: managers.id })
					.from(managers)
					.where(and(eq(managers.userId, domainUser.id), eq(managers.subjectUserId, subjectUserId), isNull(managers.deletedAt)))
			: [];
		if (!membership) error(403, 'Not authorized to view this document.');
	}

	const localDir = env.STORAGE_LOCAL_DIR || '.uploads';
	const filePath = path.join(process.cwd(), localDir, 'leaders', String(leaderId), filename);

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
