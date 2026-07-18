// Quick-jump autocomplete for the header search: leaders grouped by seat family
// (Executive / Parliament / MCAs) plus parties. The static groups (platform
// pages, regions) live client-side in QuickSearch.svelte — this endpoint only
// answers what needs the DB. Verified profiles only, same rule as /search.
import { json } from '@sveltejs/kit';
import { and, eq, ilike, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { leaders, parties, positions, users } from '$lib/server/db/schema';
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
	if (q.length < 2) return json({ executive: [], parliament: [], mcas: [], parties: [] });
	const like = `%${q}%`;

	const [leaderRows, partyRows] = await Promise.all([
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
			.where(
				and(
					isNull(leaders.deletedAt),
					isNotNull(leaders.verifiedAt),
					or(ilike(users.firstName, like), ilike(users.otherNames, like), ilike(sql`${users.firstName} || ' ' || ${users.otherNames}`, like))
				)
			)
			.limit(120),
		db
			.select({ name: parties.name, abbreviation: parties.abbreviation })
			.from(parties)
			.where(and(isNull(parties.deletedAt), or(ilike(parties.name, like), ilike(parties.abbreviation, like))))
			.limit(6)
	]);

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
		}))
	});
};
