// Onboarding grants a claimant manager access immediately at payment time (see
// onboard.ts: linkProfile) — this module only handles the post-review decision,
// not staging or approval-gating (there's no staged evidence to apply here).
import { and, eq, gte, isNotNull, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { contacts, managers, posts, profileClaims, users } from '$lib/server/db/schema';
import { fullName } from '$lib/server/leader';
import { notifyUser } from '$lib/server/notifications';
import { restoreFromSeed } from '$lib/server/seedRestore';

/**
 * Admin post-review for an ONBOARDING-originated claim (see onboard.ts:
 * linkProfile) — access was already granted at payment time, so approving is a
 * no-op status update. Rejecting deactivates the manager row AND restores the
 * profile from its seed record (see seedRestore.ts) — the claimant may have
 * already edited the live profile by the time this fires, and there's no
 * "before" snapshot to undo to.
 */
export async function reviewOnboardClaim(claimId: number, adminUserId: number, outcome: 'approved' | 'rejected', notes: string) {
	const [claim] = await db.select().from(profileClaims).where(eq(profileClaims.id, claimId));
	if (!claim) return { ok: false as const, error: 'Claim not found.' };
	const subjectUserId = claim.subjectUserId;

	if (outcome === 'rejected') {
		// The whole team goes, not just the rejected claimant — a seeded profile
		// never has a manager until someone claims it, so "rejected" means back to
		// that same empty-team state, not merely removing the one bad actor (who
		// may have invited others while they had access).
		await db
			.update(managers)
			.set({ isActive: false, deletedAt: new Date() })
			.where(and(eq(managers.subjectUserId, subjectUserId), eq(managers.isActive, true), isNull(managers.deletedAt)));

		// Contacts aren't seed data, so there's nothing to restore them TO — drop
		// anything added at/after the claim was requested (the team's own additions)
		// and keep whatever predates it. NOT keyed on contacts.source: that field is
		// only set when the SPECIFIC scraper that inserted a row happened to record
		// provenance, so a genuinely pre-existing contact (e.g. an official
		// parliament.go.ke address) can still have a null source — timing is the
		// reliable signal, not that flag.
		await db
			.update(contacts)
			.set({ deletedAt: new Date() })
			.where(and(eq(contacts.userId, subjectUserId), gte(contacts.createdAt, claim.requestedAt), isNull(contacts.deletedAt)));

		// Posts are exclusively a live-app feature (no seed source at all) — every
		// one with a creatorId was written by a team member; a null creatorId is a
		// system-aggregated post (e.g. a tagged news mention) and stays.
		await db
			.update(posts)
			.set({ deletedAt: new Date() })
			.where(and(eq(posts.subjectUserId, subjectUserId), isNotNull(posts.creatorId), isNull(posts.deletedAt)));

		const restored = await restoreFromSeed(subjectUserId);
		if (!restored.ok) console.error(`restoreFromSeed failed for claim ${claimId}: ${restored.error}`);
	}

	await db
		.update(profileClaims)
		.set({ outcome, notes: notes || null, reviewedBy: adminUserId, reviewedAt: new Date() })
		.where(eq(profileClaims.id, claimId));

	const [subject] = await db.select({ firstName: users.firstName, otherNames: users.otherNames }).from(users).where(eq(users.id, subjectUserId));
	const profileName = subject ? fullName(subject) : 'the profile';
	await notifyUser(claim.claimedBy, {
		kind: 'claim',
		title: outcome === 'approved' ? 'Your profile claim was approved' : 'Your profile claim was rejected',
		body:
			outcome === 'approved'
				? `Your claim on ${profileName}'s profile was approved.`
				: `Your claim on ${profileName}'s profile was rejected and your access has been revoked.${notes ? ` Reason: ${notes}` : ''}`,
		href: '/dashboard'
	});

	return { ok: true as const };
}
