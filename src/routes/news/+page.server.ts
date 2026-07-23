import { and, desc, count, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { posts, users, leaders, campaigns } from '$lib/server/db/schema';
import { fullName, leaderPath } from '$lib/server/leader';
import { plainText } from '$lib/utils/richtext';
import { getPageSize } from '$lib/server/settings';
import type { PageServerLoad } from './$types';

const initialsOf = (name: string) =>
	name
		.split(/\s+/)
		.map((w) => w[0])
		.join('')
		.slice(0, 2)
		.toUpperCase();

export const load: PageServerLoad = async ({ url }) => {
	const pageSize = await getPageSize();
	const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));

	// Only posts from a publicly visible person: a verified held term, or a
	// verified aspirant campaign — same gate the rest of the platform uses.
	const [verifiedLeaderRows, verifiedCampaignRows] = await Promise.all([
		db.select({ id: leaders.userId }).from(leaders).where(and(isNull(leaders.deletedAt), isNotNull(leaders.verifiedAt))),
		db.select({ id: campaigns.subjectUserId }).from(campaigns).where(and(isNull(campaigns.deletedAt), isNotNull(campaigns.verifiedAt)))
	]);
	const publicUserIds = [...new Set([...verifiedLeaderRows, ...verifiedCampaignRows].map((r) => r.id).filter((id): id is number => id !== null))];

	if (publicUserIds.length === 0) return { articles: [], total: 0, page, pageSize };

	// Team-authored (creatorId set — excludes aggregated news mentions), published,
	// not-deactivated.
	const filter = and(
		inArray(posts.subjectUserId, publicUserIds),
		isNotNull(posts.creatorId),
		isNotNull(posts.slug),
		eq(posts.medium, 'web'),
		eq(posts.public, true),
		isNull(posts.archivedAt),
		isNull(posts.deletedAt),
		isNull(users.deletedAt)
	);

	const [rows, [{ n: total }]] = await Promise.all([
		db
			.select({ post: posts, author: users })
			.from(posts)
			.innerJoin(users, eq(posts.subjectUserId, users.id))
			.where(filter)
			.orderBy(desc(posts.createdAt))
			.limit(pageSize)
			.offset((page - 1) * pageSize),
		db
			.select({ n: count() })
			.from(posts)
			.innerJoin(users, eq(posts.subjectUserId, users.id))
			.where(filter)
	]);

	return {
		articles: rows.map((r) => {
			const authorName = fullName(r.author);
			const excerpt = plainText(r.post.body);
			return {
				slug: r.post.slug,
				title: r.post.title,
				excerpt: excerpt.length > 250 ? `${excerpt.slice(0, 250)}…` : excerpt,
				tags: r.post.tags ?? [],
				authorName,
				authorInitials: initialsOf(authorName),
				authorPhotoUrl: r.author.photoUrl,
				authorPath: leaderPath(r.author),
				createdAt: r.post.createdAt.toISOString()
			};
		}),
		total,
		page,
		pageSize
	};
};
