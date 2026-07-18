import { fail } from '@sveltejs/kit';
import { and, count, desc, eq, gte, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { posts, tags } from '$lib/server/db/schema';
import { requireLeader } from '$lib/server/dashboard';
import { fullName } from '$lib/server/leader';
import { answerConstituentQuestion } from '$lib/server/ai';
import { getPageSize } from '$lib/server/settings';
import type { Actions, PageServerLoad } from './$types';

// PR desk: every news post tagged to this leader is a mention. Mentions come
// from the aggregation pipeline (dev: seeded samples). A volume spike raises
// the crisis banner; sentiment-based alerts arrive with the analysis pipeline.
const CRISIS_THRESHOLD_24H = 3;

export const load: PageServerLoad = async (event) => {
	const { ctx } = await requireLeader(event);
	const pageSize = await getPageSize();
	const page = Math.max(1, Number(event.url.searchParams.get('page') ?? 1));

	const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
	const mentionFilter = and(eq(tags.subjectUserId, ctx.profileUser.id), isNull(tags.deletedAt), isNull(posts.deletedAt));

	const [mentionRows, [totalRow], [dayRow], draftRows] = await Promise.all([
		db
			.select({ tagId: tags.id, post: posts })
			.from(tags)
			.innerJoin(posts, eq(tags.postId, posts.id))
			.where(mentionFilter)
			.orderBy(desc(posts.createdAt))
			.limit(pageSize)
			.offset((page - 1) * pageSize),
		db
			.select({ n: count() })
			.from(tags)
			.innerJoin(posts, eq(tags.postId, posts.id))
			.where(mentionFilter),
		db
			.select({ n: count() })
			.from(tags)
			.where(
				and(eq(tags.subjectUserId, ctx.profileUser.id), isNull(tags.deletedAt), gte(tags.createdAt, dayAgo))
			),
		// Draft responses live in the posts CMS as unpublished posts.
		db
			.select()
			.from(posts)
			.where(
				and(
					eq(posts.subjectUserId, ctx.profileUser.id),
					eq(posts.medium, 'web'),
					eq(posts.public, false),
					isNull(posts.deletedAt)
				)
			)
			.orderBy(desc(posts.createdAt))
	]);

	return {
		mentions: mentionRows.map((m) => ({
			tagId: m.tagId,
			postId: m.post.id,
			title: m.post.title,
			summary: m.post.aiSummary ?? m.post.body.slice(0, 160),
			createdAt: m.post.createdAt.toISOString()
		})),
		total: totalRow.n,
		page,
		pageSize,
		mentions24h: dayRow.n,
		crisis: dayRow.n >= CRISIS_THRESHOLD_24H,
		drafts: draftRows.map((d) => ({ id: d.id, title: d.title }))
	};
};

export const actions: Actions = {
	// Drafts a response into the posts CMS (unpublished) — AI-written when a key
	// is configured, template otherwise. The team edits and publishes from Posts.
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
				positionTitle: ctx.position.title,
				regionLabel: ctx.position.region,
				status: ctx.leader.status,
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
				: `${leaderName}'s office has noted the coverage "${mention.title}". [State the position in two sentences.] We remain focused on delivering for ${ctx.position.region} and welcome scrutiny of our record.`;

		await db.insert(posts).values({
			creatorId: domainUser.id,
			subjectUserId: ctx.profileUser.id,
			title: `Response: ${mention.title}`,
			body: answer,
			medium: 'web',
			approved: true,
			public: false // stays a draft until the team publishes from the Posts CMS
		});

		return { drafted: true };
	}
};
