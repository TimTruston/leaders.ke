import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	ambassadors,
	campaigns,
	followers,
	managers,
	pillars,
	posts
} from '$lib/server/db/schema';
import { requireDashboardUser } from '$lib/server/dashboard';
import { getLeaderContext } from '$lib/server/leader';
import type { PageServerLoad } from './$types';

// Overview: live campaign stats + the onboarding checklist driven by real state.
export const load: PageServerLoad = async (event) => {
	const { domainUser } = await requireDashboardUser(event);
	const ctx = await getLeaderContext(domainUser.id);

	if (!ctx) {
		return {
			stats: null,
			checklist: { hasProfile: false, pillarCount: 0, postCount: 0, teamCount: 0 }
		};
	}

	const leaderId = ctx.leader.id;

	const [[followerRow], [postRow], [managerRow], [ambassadorRow], [pillarRow]] = await Promise.all([
		db
			.select({ n: count() })
			.from(followers)
			.where(
				and(
					eq(followers.digest, 'leader'),
					eq(followers.digestId, leaderId),
					isNull(followers.deletedAt)
				)
			),
		db
			.select({ n: count() })
			.from(posts)
			.where(and(eq(posts.leaderId, leaderId), eq(posts.medium, 'web'), isNull(posts.deletedAt))),
		db
			.select({ n: count() })
			.from(managers)
			.where(
				and(eq(managers.leaderId, leaderId), eq(managers.isActive, true), isNull(managers.deletedAt))
			),
		db
			.select({ n: count() })
			.from(ambassadors)
			.where(
				and(
					eq(ambassadors.leaderId, leaderId),
					eq(ambassadors.isActive, true),
					isNull(ambassadors.deletedAt)
				)
			),
		db
			.select({ n: count() })
			.from(pillars)
			.innerJoin(campaigns, eq(pillars.campaignId, campaigns.id))
			.where(and(eq(campaigns.leaderId, leaderId), isNull(pillars.deletedAt)))
	]);

	const teamCount = managerRow.n + ambassadorRow.n;

	return {
		stats: {
			followerCount: followerRow.n,
			postCount: postRow.n,
			teamCount,
			pillarCount: pillarRow.n
		},
		checklist: {
			hasProfile: true,
			pillarCount: pillarRow.n,
			postCount: postRow.n,
			teamCount
		}
	};
};
