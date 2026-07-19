import { and, eq, exists, inArray, ilike, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { alliances, campaigns, experience, leaders, parties, partyMemberships, positions, users } from '$lib/server/db/schema';
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
				isNotNull(leaders.verifiedAt),
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
	const matchedPersonIds = matchedLeaders.map((r) => r.users.id);

	// Live party per matched PERSON (membership is person-scoped).
	const partyRowsForLeaders = matchedPersonIds.length
		? await db
				.select({ userId: partyMemberships.subjectUserId, partyName: parties.name })
				.from(partyMemberships)
				.innerJoin(parties, eq(partyMemberships.partyId, parties.id))
				.where(
					and(
						inArray(partyMemberships.subjectUserId, matchedPersonIds),
						isNull(partyMemberships.deletedAt),
						isNull(partyMemberships.endAt)
					)
				)
		: [];
	const partyByPerson = new Map(partyRowsForLeaders.map((p) => [p.userId, p.partyName]));

	const leaderResults = matchedLeaders.map((r) => {
		const name = fullName(r.users);
		const party = partyByPerson.get(r.users.id) ?? null;
		return {
			name,
			initials: name
				.split(/\s+/)
				.map((w) => w[0])
				.join('')
				.slice(0, 2)
				.toUpperCase(),
			verified: !!r.leaders.verifiedAt,
			photoUrl: r.users.photoUrl,
			path: leaderPath(r.users),
			positionTitle: r.positions.title,
			region: r.positions.region,
			party,
			partyPath: party ? `/parties/${slugify(party)}` : null,
			bio: r.users.bio
		};
	});

	// Verified 2027 runs (campaigns) matching by name/bio — aspirants with no leaders
	// row. Appended after held-office results, skipping anyone already matched above.
	const heldSlugs = new Set(matchedLeaders.map((r) => r.users.slug));
	const runMatches = await db
		.select({
			slug: users.slug,
			firstName: users.firstName,
			otherNames: users.otherNames,
			photoUrl: users.photoUrl,
			bio: users.bio,
			title: positions.title,
			region: positions.region
		})
		.from(campaigns)
		.innerJoin(users, eq(campaigns.subjectUserId, users.id))
		.innerJoin(positions, eq(campaigns.positionId, positions.id))
		.where(
			and(
				isNull(campaigns.parentCampaignId),
				isNotNull(campaigns.verifiedAt),
				isNull(campaigns.deletedAt),
				or(ilike(users.firstName, like), ilike(users.otherNames, like), ilike(users.bio, like), ilike(positions.title, like), ilike(positions.region, like))
			)
		)
		.limit(20);
	for (const r of runMatches) {
		if (!r.slug || heldSlugs.has(r.slug)) continue;
		heldSlugs.add(r.slug);
		const name = fullName(r);
		leaderResults.push({
			name,
			initials: name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
			verified: true,
			photoUrl: r.photoUrl,
			path: leaderPath({ slug: r.slug }),
			positionTitle: r.title,
			region: r.region,
			party: null,
			partyPath: null,
			bio: r.bio
		});
	}

	const experienceRows = await db
		.select({
			title: experience.title,
			institution: experience.institution,
			slug: users.slug,
			name: users.firstName,
			otherNames: users.otherNames
		})
		.from(experience)
		.innerJoin(users, eq(experience.subjectUserId, users.id))
		.where(
			and(
				isNull(experience.deletedAt),
				or(ilike(experience.title, like), ilike(experience.institution, like)),
				// Only surface people who are publicly visible: a verified held term or a verified run.
				or(
					exists(db.select({ x: sql`1` }).from(leaders).where(and(eq(leaders.userId, users.id), isNotNull(leaders.verifiedAt), isNull(leaders.deletedAt)))),
					exists(db.select({ x: sql`1` }).from(campaigns).where(and(eq(campaigns.subjectUserId, users.id), isNotNull(campaigns.verifiedAt), isNull(campaigns.deletedAt))))
				)
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
