// onboarding.md: pay-after-approval. A leader submits evidence; an admin reviews
// it; approval is what sets leaders.verifiedAt and locks the person's slug. Payment
// (subscriptions) is a separate, later concern — not gated here.
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { contacts, leaders, managers, parties, partyMemberships, positions, users, verifications } from '$lib/server/db/schema';
import { fullName, isSlugAvailable, leaderPath } from '$lib/server/leader';
import { notifyUser } from '$lib/server/notifications';
import { signoffComplete, type ManagerRoles } from '$lib/utils/campaignRoles';

export type VerificationRow = {
	verificationId: number;
	leaderId: number;
	userId: number;
	firstName: string;
	otherNames: string;
	slug: string | null;
	requestedAt: string;
	verifiedAt: string | null; // leaders.verifiedAt — the actual live/public state
	outcome: 'approved' | 'rejected' | null; // null = pending
	notes: string | null; // admin's reason, shown on the row below a rejected request
};

/** This leader's live pending (unreviewed) verification request, if any. */
export async function getPendingVerification(leaderId: number) {
	const [row] = await db
		.select({ id: verifications.id, requestedAt: verifications.requestedAt })
		.from(verifications)
		.where(and(eq(verifications.leaderId, leaderId), isNull(verifications.outcome)));
	return row ?? null;
}

/**
 * The reason (and when) behind this leader's most recent rejection — but only when
 * their latest request is that rejection, i.e. they haven't re-submitted since. Surfaced
 * back on the application page so a rejected applicant knows what to fix.
 */
export async function getLatestRejection(leaderId: number) {
	const [row] = await db
		.select({
			notes: verifications.notes,
			outcome: verifications.outcome,
			reviewedAt: verifications.reviewedAt
		})
		.from(verifications)
		.where(eq(verifications.leaderId, leaderId))
		.orderBy(desc(verifications.requestedAt))
		.limit(1);
	if (!row || row.outcome !== 'rejected') return null;
	return { notes: row.notes, reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null };
}

/** Submits a verification request. Fails if one is already pending — the
 * partial unique index (one_pending_verification_per_leader) enforces this too,
 * this is just a friendlier error before hitting the DB constraint. */
export async function requestVerification(leaderId: number, requestedBy: number, evidence: Record<string, string>) {
	const existing = await getPendingVerification(leaderId);
	if (existing) return { ok: false as const, error: 'A verification request is already pending review.' };

	await db.insert(verifications).values({ leaderId, requestedBy, evidence });
	return { ok: true as const };
}

export type VerificationPage = { requests: VerificationRow[]; total: number };

/** Every verification request ever made, newest first — pending, approved, and
 * rejected — so an admin can revert a past decision, not just clear the queue. */
export async function listVerifications(page: number, pageSize: number): Promise<VerificationPage> {
	const [rows, [{ total }]] = await Promise.all([
		db
			.select({
				verificationId: verifications.id,
				leaderId: verifications.leaderId,
				userId: users.id,
				firstName: users.firstName,
				otherNames: users.otherNames,
				slug: users.slug,
				requestedAt: verifications.requestedAt,
				verifiedAt: leaders.verifiedAt,
				outcome: verifications.outcome,
				notes: verifications.notes
			})
			.from(verifications)
			.innerJoin(leaders, eq(verifications.leaderId, leaders.id))
			.innerJoin(users, eq(leaders.userId, users.id))
			.orderBy(desc(verifications.requestedAt))
			.limit(pageSize)
			.offset((page - 1) * pageSize),
		db.select({ total: count() }).from(verifications)
	]);

	return {
		total,
		requests: rows.map((r) => ({
			...r,
			requestedAt: r.requestedAt.toISOString(),
			verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString() : null
		}))
	};
}

export type VerificationDetail = NonNullable<Awaited<ReturnType<typeof getVerificationDetail>>>;

/**
 * Everything an admin needs to review one request in full, mirroring the
 * applicant's own tabs (Profile / Contacts / Team / Documentation / Signoff)
 * so the decision happens where the evidence is, not off a bare queue row.
 */
export async function getVerificationDetail(verificationId: number) {
	const [request] = await db.select().from(verifications).where(eq(verifications.id, verificationId));
	if (!request) return null;

	const [leaderRow] = await db
		.select()
		.from(leaders)
		.leftJoin(positions, eq(leaders.positionId, positions.id))
		.where(eq(leaders.id, request.leaderId));
	if (!leaderRow) return null;
	const leader = leaderRow.leaders;
	const seat = leaderRow.positions;

	const [[profileUser], [applicant], contactRows, teamRows, [membership], historyRows] = await Promise.all([
		db.select().from(users).where(eq(users.id, leader.userId)),
		db.select().from(users).where(eq(users.id, request.requestedBy)),
		db
			.select({ channel: contacts.channel, value: contacts.value, verifiedAt: contacts.verifiedAt })
			.from(contacts)
			.where(and(eq(contacts.userId, leader.userId), isNull(contacts.deletedAt))),
		db
			.select({ userId: managers.userId, roles: managers.roles, firstName: users.firstName, otherNames: users.otherNames })
			.from(managers)
			.innerJoin(users, eq(managers.userId, users.id))
			.where(and(eq(managers.subjectUserId, leader.userId), eq(managers.isActive, true), isNull(managers.deletedAt))),
		db
			.select({ name: parties.name, abbreviation: parties.abbreviation })
			.from(partyMemberships)
			.innerJoin(parties, eq(partyMemberships.partyId, parties.id))
			.where(and(eq(partyMemberships.leaderId, leader.id), isNull(partyMemberships.deletedAt), isNull(partyMemberships.endAt))),
		// Every request this leader ever made, with who reviewed it: the paper trail.
		db
			.select({
				id: verifications.id,
				requestedAt: verifications.requestedAt,
				outcome: verifications.outcome,
				notes: verifications.notes,
				reviewedAt: verifications.reviewedAt,
				reviewerFirstName: users.firstName,
				reviewerOtherNames: users.otherNames
			})
			.from(verifications)
			.leftJoin(users, eq(verifications.reviewedBy, users.id))
			.where(eq(verifications.leaderId, request.leaderId))
			.orderBy(desc(verifications.requestedAt))
	]);

	return {
		request: {
			id: request.id,
			requestedAt: request.requestedAt.toISOString(),
			outcome: request.outcome,
			notes: request.notes,
			reviewedAt: request.reviewedAt ? request.reviewedAt.toISOString() : null,
			requestedByName: applicant ? fullName(applicant) : null,
			evidence: request.evidence as Record<string, string>
		},
		profile: {
			leaderId: leader.id,
			name: fullName(profileUser),
			slug: profileUser.slug,
			// Admins bypass the unverified-404 on the public record page, so this
			// link works even before approval.
			publicPath: profileUser.slug ? leaderPath(profileUser) : null,
			status: leader.status,
			verifiedAt: leader.verifiedAt ? leader.verifiedAt.toISOString() : null,
			bio: profileUser.bio,
			address: profileUser.address,
			socials: (profileUser.socials ?? {}) as Record<string, string>,
			seat: seat ? { title: seat.title, region: seat.region } : null,
			party: membership ? `${membership.name}${membership.abbreviation ? ` (${membership.abbreviation})` : ''}` : null
		},
		contacts: contactRows.map((c) => ({ channel: c.channel, value: c.value, verified: !!c.verifiedAt })),
		// Each manager carries their own sign-off (role, national ID, ID images) on
		// their manager row — no longer a single applicant attestation.
		team: teamRows.map((t) => {
			const roles = (t.roles ?? {}) as ManagerRoles;
			return {
				name: fullName(t),
				title: roles.title ?? null,
				nationalId: roles.nationalId ?? null,
				idFrontUrl: roles.idFrontUrl ?? null,
				idBackUrl: roles.idBackUrl ?? null,
				signoffComplete: signoffComplete(roles),
				isApplicant: t.userId === request.requestedBy
			};
		}),
		documentation: { photoUrl: leader.photoUrl, iebcCertificateUrl: leader.iebcCertificateUrl },
		history: historyRows.map((h) => ({
			id: h.id,
			requestedAt: h.requestedAt.toISOString(),
			outcome: h.outcome,
			notes: h.notes,
			reviewedAt: h.reviewedAt ? h.reviewedAt.toISOString() : null,
			reviewerName: h.reviewerFirstName ? `${h.reviewerFirstName} ${h.reviewerOtherNames}` : null
		}))
	};
}

/**
 * Admin decision on a request — re-reviewable at any time, not just once: approving
 * sets leaders.verifiedAt (and locks the person's slug); rejecting an already-approved
 * request reverts it, clearing verifiedAt and taking the profile back off the public
 * pages (leaders.verifiedAt is what every public page gates on, so this is a real revert).
 */
export async function reviewVerification(
	verificationId: number,
	adminUserId: number,
	outcome: 'approved' | 'rejected',
	notes: string
) {
	const [request] = await db.select().from(verifications).where(eq(verifications.id, verificationId));
	if (!request) return { ok: false as const, error: 'Request not found.' };

	if (outcome === 'approved') {
		const [leader] = await db.select().from(leaders).where(eq(leaders.id, request.leaderId));
		const [subject] = await db.select().from(users).where(eq(users.id, leader.userId));

		// The slug was only ever a draft while unverified; re-check it's still free
		// (another verified person may have claimed it in the meantime).
		if (subject.slug && !(await isSlugAvailable(subject.slug, subject.id))) {
			return { ok: false as const, error: `The URL "/${subject.slug}" was claimed by someone else. Pick a new one before approving.` };
		}

		await db.update(leaders).set({ verifiedAt: new Date() }).where(eq(leaders.id, request.leaderId));
	} else {
		await db.update(leaders).set({ verifiedAt: null }).where(eq(leaders.id, request.leaderId));
	}

	await db
		.update(verifications)
		.set({ outcome, notes: notes || null, reviewedBy: adminUserId, reviewedAt: new Date() })
		.where(eq(verifications.id, verificationId));

	// Tell the applicant (in-app notification + email) what was decided and why.
	await notifyUser(request.requestedBy, {
		kind: 'verification',
		title: outcome === 'approved' ? 'Your verification was approved' : 'Your verification was rejected',
		body:
			outcome === 'approved'
				? 'Congratulations — your leaders.ke verification application was approved. Your profile is now live and publicly visible.'
				: `Your leaders.ke verification application was rejected.${notes ? ` Reason: ${notes}` : ''}\n\nYou can address the reason and re-submit from your dashboard.`,
		href: '/dashboard'
	});

	return { ok: true as const };
}
