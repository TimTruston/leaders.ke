// Local-disk file storage for the campaign-application Documentation uploads
// (photo, ID front/back, IEBC certificate). Writes under STORAGE_LOCAL_DIR
// (default .uploads, kept outside src/ and gitignored) and returns a URL served
// by src/routes/uploads/[...path]/+server.ts. Swap for real S3 presigned uploads
// later — STORAGE_ENDPOINT/BUCKET/keys are already in .env for that, just unused so far.
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '$env/dynamic/private';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB — generous for a phone photo/scan or a short PDF

export type UploadKind = 'photo' | 'id-front' | 'id-back' | 'iebc-certificate';

const ALLOWED_MIME: Record<UploadKind, string[]> = {
	photo: ['image/jpeg', 'image/png', 'image/webp'],
	'id-front': ['image/jpeg', 'image/png', 'image/webp'],
	'id-back': ['image/jpeg', 'image/png', 'image/webp'],
	'iebc-certificate': ['application/pdf']
};

const EXT_BY_MIME: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'application/pdf': 'pdf'
};

/** Saves an uploaded file for a given leader + document kind, returning the
 * public URL to persist on the leaders row. Rejects the wrong file type/size
 * before anything touches disk. */
export async function saveLeaderDocument(leaderId: number, kind: UploadKind, file: File): Promise<string> {
	if (file.size > MAX_UPLOAD_BYTES) {
		throw new Error('File is larger than 10 MB.');
	}
	if (!ALLOWED_MIME[kind].includes(file.type)) {
		throw new Error(
			kind === 'iebc-certificate' ? 'The IEBC certificate must be a PDF.' : 'That file must be an image (JPEG, PNG, or WebP).'
		);
	}

	const ext = EXT_BY_MIME[file.type] ?? 'bin';
	const filename = `${randomUUID()}.${ext}`;
	const localDir = env.STORAGE_LOCAL_DIR || '.uploads';
	const dir = path.join(process.cwd(), localDir, 'leaders', String(leaderId));
	await mkdir(dir, { recursive: true });

	const buffer = Buffer.from(await file.arrayBuffer());
	await writeFile(path.join(dir, filename), buffer);

	return `/uploads/leaders/${leaderId}/${filename}`;
}
