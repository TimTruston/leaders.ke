import { error } from '@sveltejs/kit';
import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, contacts, experience, followers, leaders, pillars, positions, posts, tags } from '$lib/server/db/schema';
import { ACTIVE_CYCLE, campaignPath, findLeaderBySlug, fullName, slugify } from '$lib/server/leader';
import type { PageServerLoad } from './$types';

// /[leader]: the permanent leader record — bio, verified track record across
// every seat they've held or are vying for, education/professional experience,
// and a pointer to the active campaign workspace at /[leader]/[year].
export const load: PageServerLoad = async ({ params }) => {
	const row = await findLeaderBySlug(params.leader);

	if (!row) error(404, 'Leader not found');

	const terms = await db
		.select()
		.from(leaders)
		.innerJoin(positions, eq(leaders.positionId, positions.id))
		.where(and(eq(leaders.userId, row.users.id), isNull(leaders.deletedAt)));

	// The seat this page leads with: whichever term has a live campaign (not
	// 'former'), else their most recent past term. Track Record below still
	// lists every seat regardless.
	const currentTerm =
		terms.find((t) => t.leaders.status !== 'former') ??
		terms.toSorted((a, b) => b.leaders.from.getTime() - a.leaders.from.getTime())[0];
	const leaderId = currentTerm.leaders.id;
	const allLeaderIds = terms.map((t) => t.leaders.id);

	const [[pillarRow], [followerRow], latestPost, pillarStatusRows, mentionRows, experienceRows, contactRows] =
		await Promise.all([
			db
				.select({ n: count() })
				.from(pillars)
				.innerJoin(campaigns, eq(pillars.campaignId, campaigns.id))
				.where(and(eq(campaigns.leaderId, leaderId), isNull(pillars.deletedAt))),
			db
				.select({ n: count() })
				.from(followers)
				.where(and(eq(followers.digest, 'leader'), eq(followers.digestId, leaderId), isNull(followers.deletedAt))),
			db
				.select({ title: posts.title, createdAt: posts.createdAt })
				.from(posts)
				.where(and(eq(posts.leaderId, leaderId), eq(posts.medium, 'web'), eq(posts.public, true), isNull(posts.deletedAt)))
				.orderBy(desc(posts.createdAt))
				.limit(1),
			// Delivery tracker rollup for the public delivery score.
			db
				.select({ deliveryStatus: pillars.deliveryStatus })
				.from(pillars)
				.innerJoin(campaigns, eq(pillars.campaignId, campaigns.id))
				.where(and(eq(campaigns.leaderId, leaderId), isNull(pillars.deletedAt))),
			// "In the news": aggregated coverage tagged to this leader (any of their terms).
			db
				.select({ id: posts.id, title: posts.title, summary: posts.aiSummary, body: posts.body, createdAt: posts.createdAt })
				.from(tags)
				.innerJoin(posts, eq(tags.postId, posts.id))
				.where(and(inArray(tags.leaderId, allLeaderIds), isNull(tags.deletedAt), isNull(posts.deletedAt)))
				.orderBy(desc(posts.createdAt))
				.limit(10),
			// Education + professional history spans every term (attached to whichever
			// leaderId existed when it was seeded, not necessarily the current one).
			db
				.select({ type: experience.type, title: experience.title, institution: experience.institution, from: experience.from, to: experience.to })
				.from(experience)
				.where(and(inArray(experience.leaderId, allLeaderIds), isNull(experience.deletedAt)))
				.orderBy(desc(experience.from)),
			// Public contact channels (email/sms), verified ones surface first.
			db
				.select({ channel: contacts.channel, value: contacts.value, verifiedAt: contacts.verifiedAt })
				.from(contacts)
				.where(and(eq(contacts.userId, row.users.id), isNull(contacts.deletedAt)))
		]);

	const deliveredCount = pillarStatusRows.filter((p) => p.deliveryStatus === 'delivered').length;
	const inProgressCount = pillarStatusRows.filter((p) => p.deliveryStatus === 'in_progress').length;

	const name = fullName(row.users);
	const isVying = currentTerm.leaders.status !== 'former';

	return {
		leader: {
			name,
			initials: name
				.split(/\s+/)
				.map((w) => w[0])
				.join('')
				.slice(0, 2)
				.toUpperCase(),
			party: null as string | null,
			regionLabel: currentTerm.positions.region,
			positionTitle: currentTerm.positions.title,
			status: currentTerm.leaders.status,
			verified: !!currentTerm.leaders.verifiedAt,
			followers: followerRow.n,
			bio: row.users.bio ?? '',
			address: row.users.address ?? null,
			socials: (row.users.socials ?? {}) as Record<string, string>
		},
		contacts: contactRows.map((c) => ({
			channel: c.channel,
			value: c.value,
			verified: !!c.verifiedAt
		})),
		experience: {
			education: experienceRows
				.filter((e) => e.type === 'education')
				.map((e) => ({ title: e.title, institution: e.institution, from: e.from?.getFullYear() ?? null, to: e.to?.getFullYear() ?? null })),
			professional: experienceRows
				.filter((e) => e.type === 'professional')
				.map((e) => ({ title: e.title, institution: e.institution, from: e.from?.getFullYear() ?? null, to: e.to?.getFullYear() ?? null }))
		},
		// Former officeholders have no live campaign; aspirants and incumbents (re-election) do.
		campaign: isVying
			? {
					year: ACTIVE_CYCLE,
					path: campaignPath(row.users),
					pillarCount: pillarRow.n,
					latestPost: latestPost[0]
						? { title: latestPost[0].title, createdAt: latestPost[0].createdAt.toISOString() }
						: null
				}
			: null,
		delivery: {
			total: pillarStatusRows.length,
			delivered: deliveredCount,
			inProgress: inProgressCount
		},
		news: mentionRows.map((m) => ({
			id: m.id,
			title: m.title,
			summary: m.summary ?? m.body.slice(0, 160),
			createdAt: m.createdAt.toISOString()
		})),
		// Vying (a future-dated aspirant term) isn't a track record yet — only seats
		// whose term actually started belong here.
		trackRecord: terms
			.filter((t) => t.leaders.from.getTime() <= Date.now())
			.map((t) => ({
				positionTitle: t.positions.title,
				regionLabel: t.positions.region,
				seatPath: `/${slugify(t.positions.title)}/${slugify(t.positions.region)}`,
				status: t.leaders.status,
				note: t.leaders.description,
				startYear: t.leaders.from.getFullYear(),
				endYear: t.leaders.to?.getFullYear() ?? null
			}))
			.sort((a, b) => b.startYear - a.startYear),
		// The breadcrumb's seat: current campaign's seat if vying, else the most recent past seat.
		// positionPath is always just /[position] (the position-level page); seatPath is the
		// canonical hub link (collapses to positionPath for single-region seats like President);
		// seatCyclePath always carries the region, since the /[year] cycle grid route needs it.
		breadcrumb: {
			positionTitle: currentTerm.positions.title,
			// Single-region national seats (President) omit the region segment, matching /president.
			regionLabel: currentTerm.positions.boundary === 'Country' ? null : currentTerm.positions.region,
			positionPath: `/${slugify(currentTerm.positions.title)}`,
			seatPath:
				currentTerm.positions.boundary === 'Country'
					? `/${slugify(currentTerm.positions.title)}`
					: `/${slugify(currentTerm.positions.title)}/${slugify(currentTerm.positions.region)}`,
			seatCyclePath: `/${slugify(currentTerm.positions.title)}/${slugify(currentTerm.positions.region)}`
		}
	};
};
