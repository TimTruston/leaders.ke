import { and, eq, exists, inArray, ilike, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { alliances, campaigns, experience, leaders, parties, positions, users } from '$lib/server/db/schema';
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
				isNull(users.deletedAt),
				or(
					ilike(users.firstName, like),
					ilike(users.otherNames, like),
					ilike(users.bio, like),
					ilike(leaders.description, like),
					ilike(positions.title, like),
					ilike(positions.region, like)
				)
			)
		)
		.limit(15);

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

	const matchedLeaders = [...bySlug.values()];

	// Party is per-term (leaders.partyId), not a person-level fact.
	const leaderPartyIds = [...new Set(matchedLeaders.map((r) => r.leaders.partyId).filter((id): id is number => id !== null))];
	const partyRowsForLeaders = leaderPartyIds.length
		? await db.select({ id: parties.id, name: parties.name }).from(parties).where(inArray(parties.id, leaderPartyIds))
		: [];
	const partyNameById = new Map(partyRowsForLeaders.map((p) => [p.id, p.name]));

	const leaderResults = matchedLeaders.map((r) => {
		const name = fullName(r.users);
		const party = r.leaders.partyId ? (partyNameById.get(r.leaders.partyId) ?? null) : null;
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

	// 2027 runs (campaigns) matching by name/bio — aspirants with no leaders row.
	// Appended after held-office results, skipping anyone already matched above.
	const heldSlugs = new Set(matchedLeaders.map((r) => r.users.slug));
	const runMatches = await db
		.select({
			slug: users.slug,
			firstName: users.firstName,
			otherNames: users.otherNames,
			photoUrl: users.photoUrl,
			bio: users.bio,
			title: positions.title,
			region: positions.region,
			verifiedAt: campaigns.verifiedAt
		})
		.from(campaigns)
		.innerJoin(users, eq(campaigns.subjectUserId, users.id))
		.innerJoin(positions, eq(campaigns.positionId, positions.id))
		.where(
			and(
				isNull(campaigns.parentCampaignId),
				isNotNull(campaigns.verifiedAt),
				isNull(campaigns.deletedAt),
				isNull(users.deletedAt),
				or(ilike(users.firstName, like), ilike(users.otherNames, like), ilike(users.bio, like), ilike(positions.title, like), ilike(positions.region, like))
			)
		)
		.limit(15);
	for (const r of runMatches) {
		if (leaderResults.length >= 15) break;
		if (!r.slug || heldSlugs.has(r.slug)) continue;
		heldSlugs.add(r.slug);
		const name = fullName(r);
		leaderResults.push({
			name,
			initials: name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
			verified: !!r.verifiedAt,
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
				isNull(users.deletedAt),
				or(ilike(experience.title, like), ilike(experience.institution, like)),
				// Only surface people who are publicly visible: a verified held term or a verified run.
				or(
					exists(db.select({ x: sql`1` }).from(leaders).where(and(eq(leaders.userId, users.id), isNotNull(leaders.verifiedAt), isNull(leaders.deletedAt)))),
					exists(db.select({ x: sql`1` }).from(campaigns).where(and(eq(campaigns.subjectUserId, users.id), isNotNull(campaigns.verifiedAt), isNull(campaigns.deletedAt))))
				)
			)
		)
		.limit(15);

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
		.limit(15);
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
