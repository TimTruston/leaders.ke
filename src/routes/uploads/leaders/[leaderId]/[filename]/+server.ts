// Serves campaign-application documents (photo, ID front/back, IEBC certificate)
// from local disk. These are ID scans — never public: only an active manager of
// that leader, or a platform admin, may fetch them.
import { error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { managers, profileClaims } from '$lib/server/db/schema';
import { requireDashboardUser } from '$lib/server/dashboard';
import type { RequestHandler } from './$types';

const EXT_CONTENT_TYPE: Record<string, string> = {
	jpg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	pdf: 'application/pdf'
};

export const GET: RequestHandler = async (event) => {
	const { domainUser } = await requireDashboardUser(event);

	// The URL segment is the PERSON's users.id (documents are person-keyed).
	const subjectUserId = Number(event.params.leaderId);
	const filename = event.params.filename;
	// No path separators allowed in either segment — blocks directory traversal.
	if (!subjectUserId || !filename || /[/\\]/.test(filename) || filename.includes('..')) {
		error(404, 'Not found');
	}

	if (!domainUser.adminAt && domainUser.id !== subjectUserId) {
		// Not the person themself: allow an active manager, or a claimant with a pending
		// claim on this person (they staged these documents as claim evidence and must be
		// able to review their own upload before approval grants them management).
		const [membership] = await db
			.select({ id: managers.id })
			.from(managers)
			.where(and(eq(managers.userId, domainUser.id), eq(managers.subjectUserId, subjectUserId), isNull(managers.deletedAt)));
		if (!membership) {
			const [pendingClaim] = await db
				.select({ id: profileClaims.id })
				.from(profileClaims)
				.where(and(eq(profileClaims.claimedBy, domainUser.id), eq(profileClaims.subjectUserId, subjectUserId), isNull(profileClaims.outcome)));
			if (!pendingClaim) error(403, 'Not authorized to view this document.');
		}
	}

	const localDir = env.STORAGE_LOCAL_DIR || '.uploads';
	const filePath = path.join(process.cwd(), localDir, 'leaders', String(subjectUserId), filename);

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
