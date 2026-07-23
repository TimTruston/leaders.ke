import { error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { posts, users } from '$lib/server/db/schema';
import { fullName, leaderPath } from '$lib/server/leader';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const [row] = await db
		.select({ post: posts, author: users })
		.from(posts)
		.innerJoin(users, eq(posts.subjectUserId, users.id))
		.where(
			and(
				eq(posts.slug, params.slug),
				eq(posts.medium, 'web'),
				eq(posts.public, true),
				isNull(posts.archivedAt),
				isNull(posts.deletedAt),
				isNull(users.deletedAt)
			)
		);
	if (!row) error(404, 'Article not found');

	const authorName = fullName(row.author);
	const initials = authorName
		.split(/\s+/)
		.map((w) => w[0])
		.join('')
		.slice(0, 2)
		.toUpperCase();

	return {
		title: row.post.title,
		body: row.post.body,
		tags: row.post.tags ?? [],
		createdAt: row.post.createdAt.toISOString(),
		author: {
			name: authorName,
			initials,
			photoUrl: row.author.photoUrl,
			path: leaderPath(row.author)
		}
	};
};
