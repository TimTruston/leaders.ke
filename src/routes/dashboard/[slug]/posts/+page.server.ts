import { fail } from '@sveltejs/kit';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { posts } from '$lib/server/db/schema';
import { requireLeader } from '$lib/server/dashboard';
import type { Actions, PageServerLoad } from './$types';

// The campaign CMS: web posts that appear on the public leader page.
// Broadcasts (medium email/sms/whatsapp) live under /dashboard/broadcasts.
export const load: PageServerLoad = async (event) => {
	const { ctx } = await requireLeader(event);

	const rows = await db
		.select()
		.from(posts)
		.where(and(eq(posts.leaderId, ctx.leader.id), eq(posts.medium, 'web'), isNull(posts.deletedAt)))
		.orderBy(desc(posts.createdAt));

	return {
		posts: rows.map((p) => ({
			id: p.id,
			title: p.title,
			body: p.body,
			isPublic: p.public,
			createdAt: p.createdAt.toISOString()
		}))
	};
};

export const actions: Actions = {
	create: async (event) => {
		const { domainUser, ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const title = String(form.get('title') ?? '').trim();
		const body = String(form.get('body') ?? '').trim();
		const publish = form.get('publish') === 'on';
		if (!title || !body) return fail(400, { error: 'A post needs a title and a body.' });

		// Team posts publish directly for now; an approval flow can gate `approved` later.
		await db.insert(posts).values({
			creatorId: domainUser.id,
			leaderId: ctx.leader.id,
			title,
			body,
			medium: 'web',
			approved: true,
			public: publish
		});
		return { saved: true };
	},

	toggle: async (event) => {
		const { ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const postId = Number(form.get('postId') ?? 0);

		const [row] = await db
			.select()
			.from(posts)
			.where(and(eq(posts.id, postId), eq(posts.leaderId, ctx.leader.id), isNull(posts.deletedAt)));
		if (!row) return fail(404, { error: 'Post not found.' });

		await db
			.update(posts)
			.set({ public: !row.public, updatedAt: new Date() })
			.where(eq(posts.id, row.id));
		return { saved: true };
	},

	remove: async (event) => {
		const { ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const postId = Number(form.get('postId') ?? 0);

		await db
			.update(posts)
			.set({ deletedAt: new Date() })
			.where(and(eq(posts.id, postId), eq(posts.leaderId, ctx.leader.id)));
		return { saved: true };
	}
};
