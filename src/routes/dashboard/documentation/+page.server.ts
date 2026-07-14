import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { leaders } from '$lib/server/db/schema';
import { requireDashboardUser, requireLeader } from '$lib/server/dashboard';
import { getLeaderContext } from '$lib/server/leader';
import { saveLeaderDocument, type UploadKind } from '$lib/server/storage';
import type { Actions, PageServerLoad } from './$types';

const COLUMN_BY_KIND = {
	photo: 'photoUrl',
	'id-front': 'idFrontUrl',
	'id-back': 'idBackUrl',
	'iebc-certificate': 'iebcCertificateUrl'
} as const;

export const load: PageServerLoad = async (event) => {
	const { domainUser } = await requireDashboardUser(event);
	const ctx = await getLeaderContext(domainUser.id);
	// Reachable before a profile is saved (applying), just with nothing to upload
	// against yet — the upload action still requires ctx (requireLeader).
	if (!ctx) return { noProfile: true as const };

	return {
		noProfile: false as const,
		photoUrl: ctx.leader.photoUrl,
		idFrontUrl: ctx.leader.idFrontUrl,
		idBackUrl: ctx.leader.idBackUrl,
		iebcCertificateUrl: ctx.leader.iebcCertificateUrl
	};
};

export const actions: Actions = {
	upload: async (event) => {
		const { ctx } = await requireLeader(event);
		const form = await event.request.formData();

		const updates: Partial<Record<(typeof COLUMN_BY_KIND)[UploadKind], string>> = {};
		for (const kind of Object.keys(COLUMN_BY_KIND) as UploadKind[]) {
			const file = form.get(kind);
			if (!(file instanceof File) || file.size === 0) continue; // not (re)uploaded this submit
			try {
				updates[COLUMN_BY_KIND[kind]] = await saveLeaderDocument(ctx.leader.id, kind, file);
			} catch (err) {
				return fail(400, { error: err instanceof Error ? err.message : 'Upload failed.' });
			}
		}

		if (Object.keys(updates).length === 0) return fail(400, { error: 'Choose at least one file to upload.' });

		await db
			.update(leaders)
			.set({ ...updates, updatedAt: new Date() })
			.where(eq(leaders.id, ctx.leader.id));

		return { uploaded: true };
	}
};
