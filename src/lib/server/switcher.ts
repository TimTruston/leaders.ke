// The account-switcher's list of managed profiles — shared by the dashboard
// layout (computed eagerly, already mid-request there) and the /api/switcher
// endpoint (lazy-fetched from anywhere else on the site, since running this on
// every page's SSR load would tax every public page view for every signed-in
// visitor, not just the rare dashboard visit).
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, leaders, managers, users } from '$lib/server/db/schema';
import { fullName } from '$lib/server/leader';

export type SwitcherCampaign = { leaderId: number; name: string; verified: boolean; basePath: string };

export async function getSwitcherProfiles(domainUserId: number): Promise<{ myCampaigns: SwitcherCampaign[] }> {
	// Every managed PROFILE, not just ones with a leaders/campaigns row — an onboarded
	// profile (created or claimed, slug minted at payment) has neither until its owner
	// later declares a term or launches a campaign, but it's real and paid-for from the
	// moment it's created, so it belongs in the switcher regardless.
	const managedPeople = await db
		.select({ users })
		.from(managers)
		.innerJoin(users, eq(managers.subjectUserId, users.id))
		.where(and(eq(managers.userId, domainUserId), eq(managers.isActive, true), isNull(managers.deletedAt), isNull(users.deletedAt)));
	const managedIds = managedPeople.map((r) => r.users.id);
	const [managedTerms, managedRuns] = managedIds.length
		? await Promise.all([
				db
					.select({ userId: leaders.userId, verifiedAt: leaders.verifiedAt })
					.from(leaders)
					.where(and(inArray(leaders.userId, managedIds), isNull(leaders.deletedAt))),
				db
					.select({ userId: campaigns.subjectUserId, verifiedAt: campaigns.verifiedAt })
					.from(campaigns)
					.where(and(inArray(campaigns.subjectUserId, managedIds), isNull(campaigns.parentCampaignId), isNull(campaigns.deletedAt)))
			])
		: [[], []];
	const termVerifiedBy = new Map<number, boolean>();
	for (const t of managedTerms) termVerifiedBy.set(t.userId, (termVerifiedBy.get(t.userId) ?? false) || !!t.verifiedAt);
	const runVerifiedBy = new Map<number, boolean>();
	for (const r of managedRuns) runVerifiedBy.set(r.userId, (runVerifiedBy.get(r.userId) ?? false) || !!r.verifiedAt);
	const myCampaigns: SwitcherCampaign[] = managedPeople.map((r) => {
		const verified = (termVerifiedBy.get(r.users.id) ?? false) || (runVerifiedBy.get(r.users.id) ?? false);
		return {
			leaderId: r.users.id,
			name: fullName(r.users),
			verified,
			// A slug always exists — onboarding mints it at payment time, before
			// anyone ever manages the profile.
			basePath: `/dashboard/${r.users.slug}`
		};
	});

	return { myCampaigns };
}
