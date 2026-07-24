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

type Article = {
	kind: 'post' | 'mention';
	id: number;
	title: string;
	excerpt: string;
	tags: string[];
	mentions: { slug: string; name: string }[];
	authorName: string;
	authorInitials: string;
	authorPhotoUrl: string | null;
	authorPath: string;
	href: string;
	external: boolean;
	createdAt: string;
};

export const load: PageServerLoad = async ({ url }) => {
	const pageSize = await getPageSize();
	const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
	const activeTag = url.searchParams.get('tag') ?? '';
	const activeMention = url.searchParams.get('mention') ?? '';

	// Only posts about/from a publicly visible person: a verified held term, or a
	// verified aspirant campaign — same gate the rest of the platform uses.
	const [verifiedLeaderRows, verifiedCampaignRows] = await Promise.all([
		db.select({ id: leaders.userId }).from(leaders).where(and(isNull(leaders.deletedAt), isNotNull(leaders.verifiedAt))),
		db.select({ id: campaigns.subjectUserId }).from(campaigns).where(and(isNull(campaigns.deletedAt), isNotNull(campaigns.verifiedAt)))
	]);
	const publicUserIds = [...new Set([...verifiedLeaderRows, ...verifiedCampaignRows].map((r) => r.id).filter((id): id is number => id !== null))];

	if (publicUserIds.length === 0) return { articles: [], total: 0, page, pageSize, tags: [], mentions: [], activeTag, activeMention };

	// Team-authored (creatorId set), published, not-deactivated — each gets its own
	// /news/[slug] article page.
	const postFilter = and(
		inArray(posts.subjectUserId, publicUserIds),
		isNotNull(posts.creatorId),
		isNotNull(posts.slug),
		eq(posts.medium, 'web'),
		eq(posts.public, true),
		isNull(posts.archivedAt),
		isNull(posts.deletedAt),
		isNull(users.deletedAt)
	);
	const postRows = await db.select({ post: posts, author: users }).from(posts).innerJoin(users, eq(posts.subjectUserId, users.id)).where(postFilter).orderBy(desc(posts.createdAt));

	const postIds = postRows.map((r) => r.post.id);
	// Team @mentions of OTHER leaders written inline in a team post's own body
	// (creatorId set on the tag — see MentionPicker/RichTextEditor).
	const inlineMentionRows = postIds.length
		? await db
				.select({ postId: tags.postId, slug: users.slug, firstName: users.firstName, otherNames: users.otherNames })
				.from(tags)
				.innerJoin(users, eq(tags.subjectUserId, users.id))
				.where(and(inArray(tags.postId, postIds), isNotNull(tags.creatorId), isNull(tags.deletedAt)))
		: [];
	const inlineMentionsByPostId = new Map<number, { slug: string; name: string }[]>();
	for (const r of inlineMentionRows) {
		if (!r.slug) continue;
		const list = inlineMentionsByPostId.get(r.postId) ?? [];
		list.push({ slug: r.slug, name: fullName(r) });
		inlineMentionsByPostId.set(r.postId, list);
	}

	// Aggregated mentions — system-authored (creatorId null), no local article page,
	// so they link out to where they were found (sourceUrl) instead. Tagged via the
	// same `tags` table, but with a null creatorId (the aggregation itself, not a
	// team member's own @mention) — see scripts/lib/seed-news.ts for the dev-seeded
	// version of what a real scraping pipeline will produce.
	const mentionPostFilter = and(
		isNull(posts.creatorId),
		eq(posts.medium, 'web'),
		eq(posts.public, true),
		isNull(posts.archivedAt),
		isNull(posts.deletedAt),
		isNull(tags.deletedAt),
		isNull(tags.creatorId),
		inArray(tags.subjectUserId, publicUserIds)
	);
	const mentionTagRows = await db
		.select({ post: posts, taggedUserId: tags.subjectUserId })
		.from(posts)
		.innerJoin(tags, eq(tags.postId, posts.id))
		.where(mentionPostFilter);

	const mentionPostById = new Map<number, typeof posts.$inferSelect>();
	const taggedUserIdsByPostId = new Map<number, number[]>();
	for (const r of mentionTagRows) {
		mentionPostById.set(r.post.id, r.post);
		const list = taggedUserIdsByPostId.get(r.post.id) ?? [];
		list.push(r.taggedUserId);
		taggedUserIdsByPostId.set(r.post.id, list);
	}
	const taggedUserIds = [...new Set([...taggedUserIdsByPostId.values()].flat())];
	const taggedUserRows = taggedUserIds.length
		? await db.select({ id: users.id, slug: users.slug, firstName: users.firstName, otherNames: users.otherNames, photoUrl: users.photoUrl }).from(users).where(inArray(users.id, taggedUserIds))
		: [];
	const taggedUserById = new Map(taggedUserRows.map((u) => [u.id, u]));

	// Sidebar option lists — every tag/mentioned leader across BOTH team posts and
	// aggregated mentions, with how many articles carry it, most-used first.
	const tagCounts = new Map<string, number>();
	const mentionCounts = new Map<string, { name: string; n: number }>();
	const bump = (slug: string, name: string) => mentionCounts.set(slug, { name, n: (mentionCounts.get(slug)?.n ?? 0) + 1 });
	for (const r of postRows) {
		for (const t of r.post.tags ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
		for (const m of inlineMentionsByPostId.get(r.post.id) ?? []) bump(m.slug, m.name);
	}
	for (const [postId, post] of mentionPostById) {
		for (const t of post.tags ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
		for (const uid of taggedUserIdsByPostId.get(postId) ?? []) {
			const u = taggedUserById.get(uid);
			if (u?.slug) bump(u.slug, fullName(u));
		}
	}
	const tagOptions = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).map(([tag, n]) => ({ tag, n }));
	const mentionOptions = [...mentionCounts.entries()].sort((a, b) => b[1].n - a[1].n).map(([slug, v]) => ({ slug, name: v.name, n: v.n }));

	const articles: Article[] = [
		...postRows.map((r) => {
			const authorName = fullName(r.author);
			const excerpt = plainText(r.post.body);
			return {
				kind: 'post' as const,
				id: r.post.id,
				title: r.post.title,
				excerpt: excerpt.length > 250 ? `${excerpt.slice(0, 250)}…` : excerpt,
				tags: r.post.tags ?? [],
				mentions: inlineMentionsByPostId.get(r.post.id) ?? [],
				authorName,
				authorInitials: initialsOf(authorName),
				authorPhotoUrl: r.author.photoUrl,
				authorPath: leaderPath(r.author),
				href: `/news/${r.post.slug}`,
				external: false,
				createdAt: r.post.createdAt.toISOString()
			};
		}),
		...[...mentionPostById.entries()].map(([postId, post]) => {
			const taggedIds = taggedUserIdsByPostId.get(postId) ?? [];
			const taggedLeaders = taggedIds.map((uid) => taggedUserById.get(uid)).filter((u): u is NonNullable<typeof u> => !!u && !!u.slug);
			const [primary, ...rest] = taggedLeaders;
			const authorName = primary ? fullName(primary) : 'Unknown';
			const excerpt = plainText(post.body);
			return {
				kind: 'mention' as const,
				id: post.id,
				title: post.title,
				excerpt: excerpt.length > 250 ? `${excerpt.slice(0, 250)}…` : excerpt,
				tags: post.tags ?? [],
				mentions: rest.map((u) => ({ slug: u.slug as string, name: fullName(u) })),
				authorName,
				authorInitials: initialsOf(authorName),
				authorPhotoUrl: primary?.photoUrl ?? null,
				authorPath: primary?.slug ? leaderPath({ slug: primary.slug }) : '#',
				href: post.sourceUrl ?? '#',
				external: true,
				createdAt: post.createdAt.toISOString()
			};
		})
	].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

	const filtered = articles.filter((a) => {
		if (activeTag && !a.tags.includes(activeTag)) return false;
		if (activeMention) {
			const matchesPrimary = a.kind === 'mention' && a.authorPath === `/${activeMention}`;
			const matchesTagged = a.mentions.some((m) => m.slug === activeMention);
			if (!matchesPrimary && !matchesTagged) return false;
		}
		return true;
	});
	const total = filtered.length;
	const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

	return {
		articles: paged,
		total,
		page,
		pageSize,
		tags: tagOptions,
		mentions: mentionOptions,
		activeTag,
		activeMention
	};
};
