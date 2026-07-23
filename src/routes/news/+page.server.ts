import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { posts, tags, users, leaders, campaigns } from '$lib/server/db/schema';
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
	const activeTag = url.searchParams.get('tag') ?? '';
	const activeMention = url.searchParams.get('mention') ?? '';

	// Only posts from a publicly visible person: a verified held term, or a
	// verified aspirant campaign — same gate the rest of the platform uses.
	const [verifiedLeaderRows, verifiedCampaignRows] = await Promise.all([
		db.select({ id: leaders.userId }).from(leaders).where(and(isNull(leaders.deletedAt), isNotNull(leaders.verifiedAt))),
		db.select({ id: campaigns.subjectUserId }).from(campaigns).where(and(isNull(campaigns.deletedAt), isNotNull(campaigns.verifiedAt)))
	]);
	const publicUserIds = [...new Set([...verifiedLeaderRows, ...verifiedCampaignRows].map((r) => r.id).filter((id): id is number => id !== null))];

	if (publicUserIds.length === 0) return { articles: [], total: 0, page, pageSize, tags: [], mentions: [], activeTag, activeMention };

	// Team-authored (creatorId set — excludes aggregated news mentions), published,
	// not-deactivated. Fetched in full (not paginated at the DB level) since the
	// rhs tag/mention filters and their sidebar counts need the whole set anyway —
	// same in-memory filter+paginate pattern as the dashboard's own News tab.
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

	const rows = await db.select({ post: posts, author: users }).from(posts).innerJoin(users, eq(posts.subjectUserId, users.id)).where(filter).orderBy(desc(posts.createdAt));

	const postIds = rows.map((r) => r.post.id);
	const mentionRows = postIds.length
		? await db
				.select({ postId: tags.postId, slug: users.slug, firstName: users.firstName, otherNames: users.otherNames })
				.from(tags)
				.innerJoin(users, eq(tags.subjectUserId, users.id))
				.where(and(inArray(tags.postId, postIds), isNotNull(tags.creatorId), isNull(tags.deletedAt)))
		: [];
	const mentionsByPostId = new Map<number, { slug: string; name: string }[]>();
	for (const r of mentionRows) {
		if (!r.slug) continue;
		const list = mentionsByPostId.get(r.postId) ?? [];
		list.push({ slug: r.slug, name: fullName(r) });
		mentionsByPostId.set(r.postId, list);
	}

	// Sidebar option lists — every tag/mentioned leader in view, with how many
	// articles carry it, most-used first.
	const tagCounts = new Map<string, number>();
	const mentionCounts = new Map<string, { name: string; n: number }>();
	for (const r of rows) {
		for (const t of r.post.tags ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
		for (const m of mentionsByPostId.get(r.post.id) ?? []) mentionCounts.set(m.slug, { name: m.name, n: (mentionCounts.get(m.slug)?.n ?? 0) + 1 });
	}
	const tagOptions = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).map(([tag, n]) => ({ tag, n }));
	const mentionOptions = [...mentionCounts.entries()].sort((a, b) => b[1].n - a[1].n).map(([slug, v]) => ({ slug, name: v.name, n: v.n }));

	const filtered = rows.filter((r) => {
		if (activeTag && !(r.post.tags ?? []).includes(activeTag)) return false;
		if (activeMention && !(mentionsByPostId.get(r.post.id) ?? []).some((m) => m.slug === activeMention)) return false;
		return true;
	});
	const total = filtered.length;
	const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

	return {
		articles: paged.map((r) => {
			const authorName = fullName(r.author);
			const excerpt = plainText(r.post.body);
			return {
				slug: r.post.slug,
				title: r.post.title,
				excerpt: excerpt.length > 250 ? `${excerpt.slice(0, 250)}…` : excerpt,
				tags: r.post.tags ?? [],
				mentions: mentionsByPostId.get(r.post.id) ?? [],
				authorName,
				authorInitials: initialsOf(authorName),
				authorPhotoUrl: r.author.photoUrl,
				authorPath: leaderPath(r.author),
				createdAt: r.post.createdAt.toISOString()
			};
		}),
		total,
		page,
		pageSize,
		tags: tagOptions,
		mentions: mentionOptions,
		activeTag,
		activeMention
	};
};
