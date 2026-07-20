// Serves campaign-application documents (photo, ID front/back, IEBC certificate)
// from local disk. ID scans and the IEBC cert are never public: only an active
// manager of that leader, or a platform admin, may fetch them. The profile PHOTO
// is the one exception — once the profile is verified, it's exactly what the
// public /[leader] page displays, so it's servable to anyone (no auth) at that point.
import { error } from '@sveltejs/kit';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { campaigns, leaders, managers, profileClaims, users } from '$lib/server/db/schema';
import { requireDashboardUser } from '$lib/server/dashboard';
import type { RequestHandler } from './$types';

const EXT_CONTENT_TYPE: Record<string, string> = {
	jpg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	pdf: 'application/pdf'
};

export const GET: RequestHandler = async (event) => {
	// The URL segment is the PERSON's users.id (documents are person-keyed).
	const subjectUserId = Number(event.params.leaderId);
	const filename = event.params.filename;
	// No path separators allowed in either segment — blocks directory traversal.
	if (!subjectUserId || !filename || /[/\\]/.test(filename) || filename.includes('..')) {
		error(404, 'Not found');
	}

	// Public exception: this file is the person's profile photo AND the profile is
	// verified (a public term or a verified run) — exactly what /[leader] renders.
	const requestedPath = `/uploads/leaders/${subjectUserId}/${filename}`;
	const [subject] = await db.select({ photoUrl: users.photoUrl }).from(users).where(eq(users.id, subjectUserId));
	let isPublicPhoto = false;
	if (subject?.photoUrl === requestedPath) {
		const [verifiedTerms, verifiedRuns] = await Promise.all([
			db
				.select({ id: leaders.id })
				.from(leaders)
				.where(and(eq(leaders.userId, subjectUserId), isNotNull(leaders.verifiedAt), isNull(leaders.deletedAt)))
				.limit(1),
			db
				.select({ id: campaigns.id })
				.from(campaigns)
				.where(and(eq(campaigns.subjectUserId, subjectUserId), isNotNull(campaigns.verifiedAt), isNull(campaigns.deletedAt)))
				.limit(1)
		]);
		isPublicPhoto = verifiedTerms.length > 0 || verifiedRuns.length > 0;
	}

	if (!isPublicPhoto) {
		const { domainUser } = await requireDashboardUser(event);
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
			'cache-control': isPublicPhoto ? 'public, max-age=3600' : 'private, no-store'
		}
	});
};
