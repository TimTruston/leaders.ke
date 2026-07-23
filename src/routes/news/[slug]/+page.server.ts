import { error } from '@sveltejs/kit';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { posts, users, leaders, campaigns } from '$lib/server/db/schema';
import { fullName, leaderPath } from '$lib/server/leader';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const [row] = await db
		.select({ post: posts, author: users })
		.from(posts)
		.innerJoin(users, eq(posts.subjectUserId, users.id))
		.where(
			and(eq(posts.slug, params.slug), eq(posts.medium, 'web'), eq(posts.public, true), isNull(posts.archivedAt), isNull(posts.deletedAt))
		);
	if (!row) error(404, 'Article not found');

	// Same public-visibility gate as the /news list: a verified held term or a
	// verified aspirant campaign.
	const [[heldTerm], [aspirantRun]] = await Promise.all([
		db
			.select({ id: leaders.id })
			.from(leaders)
			.where(and(eq(leaders.userId, row.author.id), isNull(leaders.deletedAt), isNotNull(leaders.verifiedAt))),
		db
			.select({ id: campaigns.id })
			.from(campaigns)
			.where(and(eq(campaigns.subjectUserId, row.author.id), isNull(campaigns.deletedAt), isNotNull(campaigns.verifiedAt)))
	]);
	if (!heldTerm && !aspirantRun) error(404, 'Article not found');

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
