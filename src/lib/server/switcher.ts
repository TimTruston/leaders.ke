// The account-switcher's list of managed profiles + in-flight claims — shared by
// the dashboard layout (computed eagerly, already mid-request there) and the
// /api/switcher endpoint (lazy-fetched from anywhere else on the site, since
// running this on every page's SSR load would tax every public page view for
// every signed-in visitor, not just the rare dashboard visit).
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, leaders, managers, profileClaims, users } from '$lib/server/db/schema';
import { fullName } from '$lib/server/leader';

export type SwitcherCampaign = { leaderId: number; name: string; verified: boolean; basePath: string };
export type SwitcherClaim = { slug: string; name: string; outcome: 'approved' | 'rejected' | null };

export async function getSwitcherProfiles(domainUserId: number): Promise<{ myCampaigns: SwitcherCampaign[]; pendingClaims: SwitcherClaim[] }> {
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
			// A slug means the profile is real (onboarding mints it at payment) —
			// route there regardless of the leaders/campaigns verified state, which
			// only matters for showing the public page's own verified badge.
			basePath: r.users.slug ? `/dashboard/${r.users.slug}` : `/dashboard/apply/${r.users.authUserId}`
		};
	});

	// Every claim the viewer has in flight — the switcher lists them so a claim
	// stays reachable after navigating away. A rejected one stays listed too,
	// since it's still open for editing/resubmission. Resubmitting mints a new
	// row per attempt, so a subject can have several live rows here — collapse to
	// ONE entry per profile (newest first, preferring a still-pending row over a
	// rejected one) so the switcher's keyed-by-slug list has no duplicate keys.
	const pendingClaimRows = await db
		.select({ slug: users.slug, firstName: users.firstName, otherNames: users.otherNames, outcome: profileClaims.outcome })
		.from(profileClaims)
		.innerJoin(users, eq(profileClaims.subjectUserId, users.id))
		.where(
			and(
				eq(profileClaims.claimedBy, domainUserId),
				or(isNull(profileClaims.outcome), eq(profileClaims.outcome, 'rejected')),
				isNull(profileClaims.deletedAt)
			)
		)
		.orderBy(desc(profileClaims.requestedAt));
	const pendingBySlug = new Map<string, SwitcherClaim>();
	for (const r of pendingClaimRows) {
		if (!r.slug) continue;
		const existing = pendingBySlug.get(r.slug);
		if (!existing || (existing.outcome === 'rejected' && r.outcome === null)) {
			pendingBySlug.set(r.slug, { slug: r.slug, name: fullName(r), outcome: r.outcome });
		}
	}

	return { myCampaigns, pendingClaims: [...pendingBySlug.values()] };
}
