// Quick-jump autocomplete for the header search: leaders grouped by seat family
// (Executive / Parliament / MCAs) plus parties. The static groups (platform
// pages, regions) live client-side in QuickSearch.svelte — this endpoint only
// answers what needs the DB. Verified profiles only, same rule as /search.
import { json } from '@sveltejs/kit';
import { and, eq, exists, ilike, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, leaders, parties, positions, posts, users } from '$lib/server/db/schema';
import { fullName, leaderPath, slugify } from '$lib/server/leader';
import type { RequestHandler } from './$types';

const GROUP_BY_TITLE: Record<string, 'executive' | 'parliament' | 'mcas'> = {
	President: 'executive',
	'Deputy President': 'executive',
	Governor: 'executive',
	Senator: 'parliament',
	MP: 'parliament',
	'Woman Rep': 'parliament',
	MCA: 'mcas'
};

export const GET: RequestHandler = async ({ url }) => {
	const q = (url.searchParams.get('q') ?? '').trim();
	if (q.length < 2) return json({ executive: [], parliament: [], mcas: [], parties: [], news: [], tags: [] });
	const like = `%${q}%`;

	const nameMatch = or(ilike(users.firstName, like), ilike(users.otherNames, like), ilike(sql`${users.firstName} || ' ' || ${users.otherNames}`, like));
	// posts.tags is a jsonb string array — matches if any tag itself contains the query.
	const tagMatch = sql`exists (select 1 from jsonb_array_elements_text(${posts.tags}) as t(tag) where t.tag ilike ${like})`;
	const [heldRows, runRows, partyRows, newsRows, tagRows] = await Promise.all([
		db
			.select({
				slug: users.slug,
				firstName: users.firstName,
				otherNames: users.otherNames,
				title: positions.title,
				region: positions.region,
				status: leaders.status,
				photoUrl: users.photoUrl
			})
			.from(leaders)
			.innerJoin(users, eq(leaders.userId, users.id))
			.innerJoin(positions, eq(leaders.positionId, positions.id))
			.where(and(isNull(leaders.deletedAt), isNotNull(leaders.verifiedAt), isNull(users.deletedAt), nameMatch))
			.limit(5),
		// Verified 2027 runs (campaigns) — aspirants with no leaders row.
		db
			.select({
				slug: users.slug,
				firstName: users.firstName,
				otherNames: users.otherNames,
				title: positions.title,
				region: positions.region,
				photoUrl: users.photoUrl
			})
			.from(campaigns)
			.innerJoin(users, eq(campaigns.subjectUserId, users.id))
			.innerJoin(positions, eq(campaigns.positionId, positions.id))
			.where(and(isNull(campaigns.parentCampaignId), isNotNull(campaigns.verifiedAt), isNull(campaigns.deletedAt), isNull(users.deletedAt), nameMatch))
			.limit(5),
		db
			.select({ name: parties.name, abbreviation: parties.abbreviation })
			.from(parties)
			.where(and(isNull(parties.deletedAt), or(ilike(parties.name, like), ilike(parties.abbreviation, like))))
			.limit(5),
		// Team-authored, published articles from a publicly visible person — same
		// gate as /news. Title match only — a tag match surfaces as its own Topics
		// entry below instead of pulling in the post by its (unrelated) title.
		db
			.select({ slug: posts.slug, title: posts.title })
			.from(posts)
			.innerJoin(users, eq(posts.subjectUserId, users.id))
			.where(
				and(
					isNotNull(posts.creatorId),
					isNotNull(posts.slug),
					eq(posts.medium, 'web'),
					eq(posts.public, true),
					isNull(posts.archivedAt),
					isNull(posts.deletedAt),
					isNull(users.deletedAt),
					ilike(posts.title, like),
					or(
						exists(db.select({ x: sql`1` }).from(leaders).where(and(eq(leaders.userId, users.id), isNotNull(leaders.verifiedAt), isNull(leaders.deletedAt)))),
						exists(db.select({ x: sql`1` }).from(campaigns).where(and(eq(campaigns.subjectUserId, users.id), isNotNull(campaigns.verifiedAt), isNull(campaigns.deletedAt))))
					)
				)
			)
			.limit(5),
		// Topic tags matching the query, from publicly visible posts — the actual
		// tag is the result, not the post title (see tagMatch).
		db
			.select({ tags: posts.tags })
			.from(posts)
			.innerJoin(users, eq(posts.subjectUserId, users.id))
			.where(
				and(
					isNotNull(posts.creatorId),
					eq(posts.medium, 'web'),
					eq(posts.public, true),
					isNull(posts.archivedAt),
					isNull(posts.deletedAt),
					isNull(users.deletedAt),
					tagMatch,
					or(
						exists(db.select({ x: sql`1` }).from(leaders).where(and(eq(leaders.userId, users.id), isNotNull(leaders.verifiedAt), isNull(leaders.deletedAt)))),
						exists(db.select({ x: sql`1` }).from(campaigns).where(and(eq(campaigns.subjectUserId, users.id), isNotNull(campaigns.verifiedAt), isNull(campaigns.deletedAt))))
					)
				)
			)
			.limit(20)
	]);
	const matchingTags = [...new Set(tagRows.flatMap((r) => r.tags ?? []).filter((t) => t.toLowerCase().includes(q.toLowerCase())))].slice(0, 5);
	const leaderRows = [...heldRows, ...runRows.map((r) => ({ ...r, status: 'aspirant' }))];

	// One row per person (their non-former row when they have one), then bucket by
	// seat family, current officeholders first.
	const bySlug = new Map<string, (typeof leaderRows)[number]>();
	for (const r of leaderRows) {
		if (!r.slug) continue;
		const existing = bySlug.get(r.slug);
		if (!existing || (existing.status === 'former' && r.status !== 'former')) bySlug.set(r.slug, r);
	}
	const buckets = { executive: [] as unknown[], parliament: [] as unknown[], mcas: [] as unknown[] };
	const STATUS_ORDER: Record<string, number> = { current: 0, aspirant: 1, former: 2 };
	for (const r of [...bySlug.values()].sort(
		(a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3)
	)) {
		const group = GROUP_BY_TITLE[r.title];
		if (!group || buckets[group].length >= 5) continue;
		const name = fullName({ firstName: r.firstName, otherNames: r.otherNames });
		buckets[group].push({
			label: name,
			sub: `${r.title}, ${r.region}${r.status === 'former' ? ' (former)' : r.status === 'aspirant' ? ' (2027)' : ''}`,
			path: leaderPath({ slug: r.slug }),
			photoUrl: r.photoUrl
		});
	}

	return json({
		...buckets,
		parties: partyRows.map((p) => ({
			label: p.abbreviation ? `${p.name} (${p.abbreviation})` : p.name,
			sub: 'Party',
			path: `/parties/${slugify(p.name)}`
		})),
		news: newsRows.map((p) => ({
			label: p.title,
			sub: 'News',
			path: `/news/${p.slug}`
		})),
		tags: matchingTags.map((tag) => ({
			label: tag,
			sub: 'Topic',
			path: `/news?tag=${encodeURIComponent(tag)}`
		}))
	});
};
