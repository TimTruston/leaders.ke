import { fail } from '@sveltejs/kit';
import { and, count, desc, eq, gte, isNull, isNotNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { posts, tags, events } from '$lib/server/db/schema';
import { requireLeader } from '$lib/server/dashboard';
import { fullName } from '$lib/server/leader';
import { generatePostSlug } from '$lib/server/posts';
import { answerConstituentQuestion } from '$lib/server/ai';
import { getPageSize } from '$lib/server/settings';
import type { Actions, PageServerLoad } from './$types';

// The News tab: campaign posts, campaign events, and aggregated external mentions,
// merged into one feed (was split across /posts and /pr). Broadcasts (medium
// email/sms/whatsapp) still live under /dashboard/broadcasts.
const CRISIS_THRESHOLD_24H = 3;

export const load: PageServerLoad = async (event) => {
	const { ctx } = await requireLeader(event);
	const pageSize = await getPageSize();
	const page = Math.max(1, Number(event.url.searchParams.get('page') ?? 1));
	const filter = event.url.searchParams.get('filter') ?? 'all'; // all | posts | events | mentions | drafts
	const sort = event.url.searchParams.get('sort') ?? 'recent'; // recent | oldest | views | likes
	const section = event.url.searchParams.get('section') ?? 'feed'; // feed | archive

	const ownPostFilter = section === 'archive'
		? and(eq(posts.subjectUserId, ctx.profileUser.id), eq(posts.medium, 'web'), isNull(posts.deletedAt), isNotNull(posts.archivedAt))
		: and(eq(posts.subjectUserId, ctx.profileUser.id), eq(posts.medium, 'web'), isNull(posts.deletedAt), isNull(posts.archivedAt));

	const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
	const mentionFilter = and(eq(tags.subjectUserId, ctx.profileUser.id), isNull(tags.deletedAt), isNull(posts.deletedAt));

	const [ownPosts, mentionRows, dayRow, eventRows] = await Promise.all([
		db.select().from(posts).where(ownPostFilter).orderBy(desc(posts.createdAt)),
		db
			.select({ tagId: tags.id, post: posts })
			.from(tags)
			.innerJoin(posts, eq(tags.postId, posts.id))
			.where(mentionFilter)
			.orderBy(desc(posts.createdAt)),
		db
			.select({ n: count() })
			.from(tags)
			.where(and(eq(tags.subjectUserId, ctx.profileUser.id), isNull(tags.deletedAt), gte(tags.createdAt, dayAgo)))
			.then(([r]) => r.n),
		ctx.campaignId
			? db
					.select()
					.from(events)
					.where(and(eq(events.campaignId, ctx.campaignId), isNull(events.deletedAt)))
					.orderBy(desc(events.startAt))
			: Promise.resolve([])
	]);

	type FeedItem = {
		kind: 'post' | 'event' | 'mention';
		id: number;
		tagId?: number;
		title: string;
		body: string;
		isPublic?: boolean;
		isDraft?: boolean;
		slug?: string | null;
		tags?: string[];
		votes?: number;
		views?: number;
		venue?: string;
		startAt?: string;
		createdAt: string;
	};

	let items: FeedItem[] = [
		...ownPosts.map((p) => ({
			kind: 'post' as const,
			id: p.id,
			title: p.title,
			body: p.body,
			isPublic: p.public,
			isDraft: !p.public,
			slug: p.slug,
			tags: p.tags ?? [],
			votes: p.votes,
			views: p.views,
			createdAt: p.createdAt.toISOString()
		})),
		...eventRows.map((e) => ({
			kind: 'event' as const,
			id: e.id,
			title: e.title,
			body: e.agenda,
			venue: e.venue,
			startAt: e.startAt.toISOString(),
			createdAt: e.createdAt.toISOString()
		})),
		...mentionRows.map((m) => ({
			kind: 'mention' as const,
			id: m.post.id,
			tagId: m.tagId,
			title: m.post.title,
			body: m.post.aiSummary ?? m.post.body.slice(0, 160),
			createdAt: m.post.createdAt.toISOString()
		}))
	];

	if (filter === 'posts') items = items.filter((i) => i.kind === 'post' && !i.isDraft);
	else if (filter === 'events') items = items.filter((i) => i.kind === 'event');
	else if (filter === 'mentions') items = items.filter((i) => i.kind === 'mention');
	else if (filter === 'drafts') items = items.filter((i) => i.kind === 'post' && i.isDraft);

	items.sort((a, b) => {
		if (sort === 'oldest') return a.createdAt.localeCompare(b.createdAt);
		if (sort === 'views') return (b.views ?? 0) - (a.views ?? 0);
		if (sort === 'likes') return (b.votes ?? 0) - (a.votes ?? 0);
		return b.createdAt.localeCompare(a.createdAt);
	});

	const total = items.length;
	const paged = items.slice((page - 1) * pageSize, page * pageSize);

	// Every tag ever used, for the "Tags" nav section.
	const allTags = [...new Set(ownPosts.flatMap((p) => p.tags ?? []))].sort();

	return {
		items: paged,
		total,
		page,
		pageSize,
		filter,
		sort,
		section,
		authorName: fullName(ctx.profileUser),
		tags: allTags,
		mentions24h: dayRow,
		crisis: dayRow >= CRISIS_THRESHOLD_24H,
		drafts: ownPosts.filter((p) => !p.public).map((d) => ({ id: d.id, title: d.title }))
	};
};

export const actions: Actions = {
	create: async (event) => {
		const { domainUser, ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const title = String(form.get('title') ?? '').trim();
		const body = String(form.get('body') ?? '').trim();
		const publish = form.get('publish') === 'on';
		const postTags = String(form.get('tags') ?? '')
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);
		if (!title || !body) return fail(400, { error: 'A post needs a title and a body.' });

		const slug = await generatePostSlug(title);

		// Team posts publish directly for now; an approval flow can gate `approved` later.
		await db.insert(posts).values({
			creatorId: domainUser.id,
			subjectUserId: ctx.profileUser.id,
			title,
			slug,
			body,
			tags: postTags,
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
			.where(and(eq(posts.id, postId), eq(posts.subjectUserId, ctx.profileUser.id), isNull(posts.deletedAt)));
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
			.where(and(eq(posts.id, postId), eq(posts.subjectUserId, ctx.profileUser.id)));
		return { saved: true };
	},

	archive: async (event) => {
		const { ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const postId = Number(form.get('postId') ?? 0);

		await db
			.update(posts)
			.set({ archivedAt: new Date() })
			.where(and(eq(posts.id, postId), eq(posts.subjectUserId, ctx.profileUser.id)));
		return { saved: true };
	},

	restore: async (event) => {
		const { ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const postId = Number(form.get('postId') ?? 0);

		await db
			.update(posts)
			.set({ archivedAt: null })
			.where(and(eq(posts.id, postId), eq(posts.subjectUserId, ctx.profileUser.id)));
		return { saved: true };
	},

	// Drafts a response into the feed (unpublished) — AI-written when a key is
	// configured, template otherwise. The team edits and publishes from here.
	draftResponse: async (event) => {
		const { domainUser, ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const postId = Number(form.get('postId') ?? 0);

		const [mention] = await db
			.select()
			.from(posts)
			.where(and(eq(posts.id, postId), isNull(posts.deletedAt)));
		if (!mention) return fail(404, { error: 'Mention not found.' });

		const leaderName = fullName(ctx.profileUser);
		const result = await answerConstituentQuestion(
			{
				name: leaderName,
				positionTitle: ctx.position?.title ?? '',
				regionLabel: ctx.position?.region ?? '',
				status: ctx.leader?.status ?? 'aspirant',
				bio: ctx.profileUser.bio ?? '',
				pillars: [],
				posts: []
			},
			`Draft a short, calm press response (under 100 words) from the leader to this coverage, restating their position without attacking the press: "${mention.title}: ${mention.body}"`
		);
		// Without an AI key the heuristic can't draft prose; fall back to a starter template.
		const answer =
			result.source === 'ai'
				? result.answer
				: `${leaderName}'s office has noted the coverage "${mention.title}". [State the position in two sentences.] We remain focused on delivering for ${ctx.position?.region ?? 'the region'} and welcome scrutiny of our record.`;

		const responseTitle = `Response: ${mention.title}`;
		await db.insert(posts).values({
			creatorId: domainUser.id,
			subjectUserId: ctx.profileUser.id,
			title: responseTitle,
			slug: await generatePostSlug(responseTitle),
			body: answer,
			medium: 'web',
			approved: true,
			public: false // stays a draft until the team publishes
		});

		return { drafted: true };
	}
};
