// Signoff tab (apply family; re-exported by dashboard/apply/[id]/signoff):
// the applicant's attestation. Role + national ID live on their manager row's
// jsonb (the application submit reads the ID from there); their ID images go on
// the leaders row's idFrontUrl/idBackUrl columns.
import { fail } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { leaders, managers } from '$lib/server/db/schema';
import { getRouteLeaderContext, requireDashboardUser, requireLeader } from '$lib/server/dashboard';
import { isCampaignRole } from '$lib/utils/campaignRoles';
import { saveLeaderDocument, type UploadKind } from '$lib/server/storage';
import type { Actions, PageServerLoad } from './$types';

const COLUMN_BY_KIND = { 'id-front': 'idFrontUrl', 'id-back': 'idBackUrl' } as const;

export const load: PageServerLoad = async (event) => {
	// A blank application is bounced back to its Profile tab (requireLeader) - the
	// layout only links here once a profile exists.
	const { domainUser, ctx } = await requireLeader(event);

	const [mine] = await db
		.select({ roles: managers.roles })
		.from(managers)
		.where(and(eq(managers.userId, domainUser.id), eq(managers.leaderId, ctx.leader.id), isNull(managers.deletedAt)));
	const roles = (mine?.roles ?? {}) as { title?: string; nationalId?: string };

	return {
		myRole: roles.title ?? '',
		nationalId: roles.nationalId ?? '',
		idFrontUrl: ctx.leader.idFrontUrl,
		idBackUrl: ctx.leader.idBackUrl
	};
};

export const actions: Actions = {
	saveMyDetails: async (event) => {
		const { domainUser, ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const title = String(form.get('myRole') ?? '').trim();
		const nationalId = String(form.get('nationalId') ?? '').trim();
		if (!isCampaignRole(title)) return fail(400, { error: 'Pick your role in this campaign.' });
		if (!nationalId) return fail(400, { error: 'Enter your national ID number.' });

		const [mine] = await db
			.select({ id: managers.id, roles: managers.roles })
			.from(managers)
			.where(and(eq(managers.userId, domainUser.id), eq(managers.leaderId, ctx.leader.id), isNull(managers.deletedAt)));
		if (!mine) return fail(403, { error: 'Only team members can save their details.' });

		await db
			.update(managers)
			.set({ roles: { ...((mine.roles ?? {}) as Record<string, unknown>), title, nationalId } })
			.where(eq(managers.id, mine.id));
		return { detailsSaved: true };
	},

	upload: async (event) => {
		const { ctx } = await requireLeader(event);
		const form = await event.request.formData();

		const updates: Partial<Record<(typeof COLUMN_BY_KIND)[keyof typeof COLUMN_BY_KIND], string>> = {};
		for (const kind of Object.keys(COLUMN_BY_KIND) as (keyof typeof COLUMN_BY_KIND)[]) {
			const file = form.get(kind);
			if (!(file instanceof File) || file.size === 0) continue; // not (re)uploaded this submit
			try {
				updates[COLUMN_BY_KIND[kind]] = await saveLeaderDocument(ctx.leader.id, kind as UploadKind, file);
			} catch (err) {
				return fail(400, { error: err instanceof Error ? err.message : 'Upload failed.' });
			}
		}
		if (Object.keys(updates).length === 0) return fail(400, { error: 'Choose a file to upload.' });

		await db
			.update(leaders)
			.set({ ...updates, updatedAt: new Date() })
			.where(eq(leaders.id, ctx.leader.id));
		return { uploaded: true };
	}
};
