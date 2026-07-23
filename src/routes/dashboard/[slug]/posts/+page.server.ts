import { fail } from '@sveltejs/kit';
import { and, count, desc, eq, gte, inArray, isNull, isNotNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { posts, tags, events, users } from '$lib/server/db/schema';
import { requireLeader } from '$lib/server/dashboard';
import { fullName } from '$lib/server/leader';
import { extractMentionSlugs, generatePostSlug } from '$lib/server/posts';
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
	const activeTag = event.url.searchParams.get('tag') ?? '';

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

	// Team-tagged mentions on each own post (creatorId set — not the system-generated
	// external coverage rows), for the composer's "Mentions" field to pre-fill on edit.
	const ownPostIds = ownPosts.map((p) => p.id);
	const ownMentionRows = ownPostIds.length
		? await db
				.select({ postId: tags.postId, slug: users.slug, firstName: users.firstName, otherNames: users.otherNames })
				.from(tags)
				.innerJoin(users, eq(tags.subjectUserId, users.id))
				.where(and(inArray(tags.postId, ownPostIds), isNotNull(tags.creatorId), isNull(tags.deletedAt)))
		: [];
	const ownMentionsByPostId = new Map<number, { slug: string; name: string }[]>();
	for (const r of ownMentionRows) {
		if (!r.slug) continue;
		const list = ownMentionsByPostId.get(r.postId) ?? [];
		list.push({ slug: r.slug, name: fullName(r) });
		ownMentionsByPostId.set(r.postId, list);
	}

	// A deep link from the public article's "Edit" button (?edit=<postId>) — fetched
	// independently of the section/filter/pagination above, since the target post
	// might be archived or off the current page.
	const editId = Number(event.url.searchParams.get('edit') ?? 0);
	let editTarget: { id: number; title: string; body: string; tags: string[]; mentions: { slug: string; name: string }[] } | null = null;
	if (editId) {
		const [p] = await db
			.select()
			.from(posts)
			.where(and(eq(posts.id, editId), eq(posts.subjectUserId, ctx.profileUser.id), isNull(posts.deletedAt)));
		if (p) {
			const rows = await db
				.select({ slug: users.slug, firstName: users.firstName, otherNames: users.otherNames })
				.from(tags)
				.innerJoin(users, eq(tags.subjectUserId, users.id))
				.where(and(eq(tags.postId, p.id), isNotNull(tags.creatorId), isNull(tags.deletedAt)));
			editTarget = {
				id: p.id,
				title: p.title,
				body: p.body,
				tags: p.tags ?? [],
				mentions: rows.filter((r) => r.slug).map((r) => ({ slug: r.slug as string, name: fullName(r) }))
			};
		}
	}

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
		mentions?: { slug: string; name: string }[];
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
			mentions: ownMentionsByPostId.get(p.id) ?? [],
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

	if (activeTag) items = items.filter((i) => i.kind === 'post' && (i.tags ?? []).includes(activeTag));

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
		activeTag,
		authorName: fullName(ctx.profileUser),
		tags: allTags,
		mentions24h: dayRow,
		crisis: dayRow >= CRISIS_THRESHOLD_24H,
		drafts: ownPosts.filter((p) => !p.public).map((d) => ({ id: d.id, title: d.title })),
		editTarget
	};
};

// Mentions come from two places: inline @links written in the body, and the
// composer's standalone "Mentions" chip field (its own slug picker) — combine both.
function mergeMentionSlugs(body: string, form: FormData): string[] {
	const chipSlugs = String(form.get('mentions') ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	return [...new Set([...extractMentionSlugs(body), ...chipSlugs])];
}

// Replaces a post's team-authored mention tags (creatorId set) with fresh ones
// parsed from its current body — leaves system-generated mention rows (external
// coverage, creatorId null) untouched.
async function syncMentions(postId: number, creatorId: number, mentionSlugs: string[]) {
	await db.delete(tags).where(and(eq(tags.postId, postId), isNotNull(tags.creatorId)));
	if (!mentionSlugs.length) return;
	const mentionedUsers = await db.select({ id: users.id }).from(users).where(and(inArray(users.slug, mentionSlugs), isNull(users.deletedAt)));
	if (mentionedUsers.length) {
		await db.insert(tags).values(mentionedUsers.map((u) => ({ creatorId, postId, subjectUserId: u.id })));
	}
}

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
		const mentionSlugs = mergeMentionSlugs(body, form);
		if (!title || !body) return fail(400, { error: 'A post needs a title and a body.' });

		const slug = await generatePostSlug(title);

		// Team posts publish directly for now; an approval flow can gate `approved` later.
		const [post] = await db
			.insert(posts)
			.values({
				creatorId: domainUser.id,
				subjectUserId: ctx.profileUser.id,
				title,
				slug,
				body,
				tags: postTags,
				medium: 'web',
				approved: true,
				public: publish
			})
			.returning({ id: posts.id });

		if (mentionSlugs.length) await syncMentions(post.id, domainUser.id, mentionSlugs);
		return { saved: true };
	},

	// Edits an existing post's title/body/tags/mentions in place — the slug and
	// creation date stay put, only ?/toggle changes public/draft state.
	update: async (event) => {
		const { domainUser, ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const postId = Number(form.get('postId') ?? 0);
		const title = String(form.get('title') ?? '').trim();
		const body = String(form.get('body') ?? '').trim();
		const postTags = String(form.get('tags') ?? '')
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);
		if (!title || !body) return fail(400, { error: 'A post needs a title and a body.' });

		const [row] = await db
			.select({ id: posts.id })
			.from(posts)
			.where(and(eq(posts.id, postId), eq(posts.subjectUserId, ctx.profileUser.id), isNull(posts.deletedAt)));
		if (!row) return fail(404, { error: 'Post not found.' });

		// Content only — publish/unpublish stays the card's own toggle so editing
		// never accidentally flips a post's public state.
		await db
			.update(posts)
			.set({ title, body, tags: postTags, updatedAt: new Date() })
			.where(eq(posts.id, row.id));

		await syncMentions(row.id, domainUser.id, mergeMentionSlugs(body, form));
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
