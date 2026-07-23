// Autocomplete for @mentions in the News composer — leaders (verified held terms
// and runs) and parties, flat (unlike quick-search's seat-family grouping). The
// standalone "Mentions" chip field (which feeds the `tags` table, subjectUserId a
// real user) filters this down to kind: 'leader' client-side; the inline @mention
// in the post body accepts either kind, since a party mention is just a link.
import { json } from '@sveltejs/kit';
import { and, eq, ilike, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, leaders, parties, positions, users } from '$lib/server/db/schema';
import { fullName, slugify } from '$lib/server/leader';
import { requireLeader } from '$lib/server/dashboard';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const { ctx } = await requireLeader(event);
	const q = (event.url.searchParams.get('q') ?? '').trim();
	if (q.length < 2) return json({ results: [] });
	const like = `%${q}%`;

	const nameMatch = or(ilike(users.firstName, like), ilike(users.otherNames, like), ilike(sql`${users.firstName} || ' ' || ${users.otherNames}`, like));
	const [heldRows, runRows, partyRows] = await Promise.all([
		db
			.select({ slug: users.slug, firstName: users.firstName, otherNames: users.otherNames, title: positions.title, region: positions.region, status: leaders.status })
			.from(leaders)
			.innerJoin(users, eq(leaders.userId, users.id))
			.innerJoin(positions, eq(leaders.positionId, positions.id))
			.where(and(isNull(leaders.deletedAt), isNotNull(leaders.verifiedAt), isNull(users.deletedAt), nameMatch))
			.limit(8),
		db
			.select({ slug: users.slug, firstName: users.firstName, otherNames: users.otherNames, title: positions.title, region: positions.region })
			.from(campaigns)
			.innerJoin(users, eq(campaigns.subjectUserId, users.id))
			.innerJoin(positions, eq(campaigns.positionId, positions.id))
			.where(and(isNull(campaigns.parentCampaignId), isNotNull(campaigns.verifiedAt), isNull(campaigns.deletedAt), isNull(users.deletedAt), nameMatch))
			.limit(8),
		db
			.select({ name: parties.name, status: parties.status })
			.from(parties)
			.where(and(isNull(parties.deletedAt), or(ilike(parties.name, like), ilike(parties.abbreviation, like))))
			.limit(5)
	]);

	const bySlug = new Map<string, (typeof heldRows)[number] & { status: string }>();
	for (const r of heldRows) if (r.slug && r.slug !== ctx.profileUser.slug) bySlug.set(r.slug, r);
	for (const r of runRows) if (r.slug && r.slug !== ctx.profileUser.slug && !bySlug.has(r.slug)) bySlug.set(r.slug, { ...r, status: 'aspirant' });

	const leaderResults = [...bySlug.values()].slice(0, 8).map((r) => ({
		kind: 'leader' as const,
		slug: r.slug as string,
		name: fullName(r),
		path: `/${r.slug}`,
		sub: `${r.title}, ${r.region}${r.status === 'former' ? ' (former)' : r.status === 'aspirant' ? ' (aspirant)' : ''}`
	}));
	const partyResults = partyRows.map((p) => ({
		kind: 'party' as const,
		slug: slugify(p.name),
		name: p.name,
		path: `/parties/${slugify(p.name)}`,
		sub: p.status === 'full' ? 'Fully registered party' : 'Provisionally registered party'
	}));

	return json({ results: [...leaderResults, ...partyResults] });
};
