import { and, eq, inArray, ilike, isNull, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { alliances, experience, leaders, parties, partyMemberships, positions, users } from '$lib/server/db/schema';
import { fullName, leaderPath, slugify } from '$lib/server/leader';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const q = (url.searchParams.get('q') ?? '').trim();
	if (!q) return { q, leaders: [], experience: [], parties: [], alliances: [] };

	const like = `%${q}%`;

	const leaderRows = await db
		.select()
		.from(leaders)
		.innerJoin(positions, eq(leaders.positionId, positions.id))
		.innerJoin(users, eq(leaders.userId, users.id))
		.where(
			and(
				isNull(leaders.deletedAt),
				or(
					ilike(users.firstName, like),
					ilike(users.otherNames, like),
					ilike(users.bio, like),
					ilike(leaders.description, like),
					ilike(positions.title, like),
					ilike(positions.region, like)
				)
			)
		);

	// A person can have several `leaders` rows (Track Record); collapse to one
	// result per slug, preferring their non-'former' row, as the directory does.
	const bySlug = new Map<string, (typeof leaderRows)[number]>();
	for (const r of leaderRows) {
		if (!r.users.slug) continue;
		const existing = bySlug.get(r.users.slug);
		if (!existing || (existing.leaders.status === 'former' && r.leaders.status !== 'former')) {
			bySlug.set(r.users.slug, r);
		}
	}

	const matchedLeaders = [...bySlug.values()].slice(0, 20);
	const matchedLeaderIds = matchedLeaders.map((r) => r.leaders.id);

	const partyRowsForLeaders = matchedLeaderIds.length
		? await db
				.select({ leaderId: partyMemberships.leaderId, partyName: parties.name })
				.from(partyMemberships)
				.innerJoin(parties, eq(partyMemberships.partyId, parties.id))
				.where(
					and(
						inArray(partyMemberships.leaderId, matchedLeaderIds),
						isNull(partyMemberships.deletedAt),
						isNull(partyMemberships.to)
					)
				)
		: [];
	const partyByLeaderId = new Map(partyRowsForLeaders.map((p) => [p.leaderId, p.partyName]));

	const leaderResults = matchedLeaders.map((r) => {
		const name = fullName(r.users);
		const party = partyByLeaderId.get(r.leaders.id) ?? null;
		return {
			name,
			initials: name
				.split(/\s+/)
				.map((w) => w[0])
				.join('')
				.slice(0, 2)
				.toUpperCase(),
			verified: !!r.leaders.verifiedAt,
			path: leaderPath(r.users),
			positionTitle: r.positions.title,
			region: r.positions.region,
			party,
			partyPath: party ? `/parties/${slugify(party)}` : null,
			bio: r.users.bio
		};
	});

	const experienceRows = await db
		.select({
			title: experience.title,
			institution: experience.institution,
			slug: users.slug,
			name: users.firstName,
			otherNames: users.otherNames
		})
		.from(experience)
		.innerJoin(leaders, eq(experience.leaderId, leaders.id))
		.innerJoin(users, eq(leaders.userId, users.id))
		.where(
			and(
				isNull(experience.deletedAt),
				or(ilike(experience.title, like), ilike(experience.institution, like))
			)
		)
		.limit(20);

	const experienceResults = experienceRows
		.filter((r) => r.slug)
		.map((r) => ({
			title: r.title,
			institution: r.institution,
			leaderName: fullName({ firstName: r.name, otherNames: r.otherNames }),
			path: leaderPath({ slug: r.slug })
		}));

	const partyRows = await db
		.select()
		.from(parties)
		.where(and(isNull(parties.deletedAt), or(ilike(parties.name, like), ilike(parties.abbreviation, like))))
		.limit(10);
	const partyResults = partyRows.map((p) => ({
		name: p.name,
		abbreviation: p.abbreviation,
		path: `/parties/${slugify(p.name)}`
	}));

	const allianceRows = await db
		.select()
		.from(alliances)
		.where(and(isNull(alliances.deletedAt), or(ilike(alliances.title, like), ilike(alliances.description, like))))
		.limit(10);
	const allianceResults = allianceRows.map((a) => ({
		title: a.title,
		description: a.description,
		path: `/alliances/${slugify(a.title)}`
	}));

	return {
		q,
		leaders: leaderResults,
		experience: experienceResults,
		parties: partyResults,
		alliances: allianceResults
	};
};
