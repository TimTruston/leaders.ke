// onboarding.md: pay-after-approval. A candidate submits evidence for their RUN; an
// admin reviews it; approval sets campaigns.verifiedAt (the run's public/ballot flag)
// and locks the person's slug. A candidacy (campaign) is the verifiable unit — an
// aspirant has no leaders row. Payment (subscriptions) is a separate, later concern.
import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, contacts, managers, users, verifications } from '$lib/server/db/schema';
import { user as authUsers } from '$lib/server/db/auth.schema';
import { fullName, isSlugAvailable } from '$lib/server/leader';
import { loadPublicProfileData } from '$lib/server/publicProfile';
import { notifyUser } from '$lib/server/notifications';
import { signoffComplete, type ManagerRoles } from '$lib/utils/campaignRoles';

export type VerificationRow = {
	verificationId: number;
	campaignId: number;
	userId: number;
	firstName: string;
	otherNames: string;
	slug: string | null;
	requestedAt: string;
	verifiedAt: string | null; // campaigns.verifiedAt — the run's live/public state
	outcome: 'approved' | 'rejected' | null; // null = pending
	notes: string | null; // admin's reason, shown on the row below a rejected request
};

/** This run's live pending (unreviewed) verification request, if any. */
export async function getPendingVerification(campaignId: number) {
	const [row] = await db
		.select({ id: verifications.id, requestedAt: verifications.requestedAt })
		.from(verifications)
		.where(and(eq(verifications.campaignId, campaignId), isNull(verifications.outcome)));
	return row ?? null;
}

/**
 * The reason (and when) behind this run's most recent rejection — but only when
 * their latest request is that rejection, i.e. they haven't re-submitted since.
 */
export async function getLatestRejection(campaignId: number) {
	const [row] = await db
		.select({ notes: verifications.notes, outcome: verifications.outcome, reviewedAt: verifications.reviewedAt })
		.from(verifications)
		.where(eq(verifications.campaignId, campaignId))
		.orderBy(desc(verifications.requestedAt))
		.limit(1);
	if (!row || row.outcome !== 'rejected') return null;
	return { notes: row.notes, reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null };
}

/** Submits a verification request for a run. Fails if one is already pending. */
export async function requestVerification(campaignId: number, requestedBy: number, evidence: Record<string, string>) {
	const existing = await getPendingVerification(campaignId);
	if (existing) return { ok: false as const, error: 'A verification request is already pending review.' };

	await db.insert(verifications).values({ campaignId, requestedBy, evidence });
	return { ok: true as const };
}

export type VerificationPage = { requests: VerificationRow[]; total: number };

/** Every verification request ever made, newest first — pending, approved, rejected. */
export async function listVerifications(page: number, pageSize: number): Promise<VerificationPage> {
	const [rows, [{ total }]] = await Promise.all([
		db
			.select({
				verificationId: verifications.id,
				campaignId: verifications.campaignId,
				userId: users.id,
				firstName: users.firstName,
				otherNames: users.otherNames,
				slug: users.slug,
				requestedAt: verifications.requestedAt,
				verifiedAt: campaigns.verifiedAt,
				outcome: verifications.outcome,
				notes: verifications.notes
			})
			.from(verifications)
			.innerJoin(campaigns, eq(verifications.campaignId, campaigns.id))
			.innerJoin(users, eq(campaigns.subjectUserId, users.id))
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

export type VerificationPreview = NonNullable<Awaited<ReturnType<typeof getVerificationPreview>>>;

/**
 * Everything an admin needs to review one request: the same public-page data the
 * profile will render once verified (LeaderProfile in `preview` mode), plus the
 * review-only extras (IEBC cert, team sign-offs, request history) and the decision
 * request itself. An application writes directly onto the real (unverified) profile
 * — no staging — so this is simply the live profile, admin-bypassed past the gate.
 */
export async function getVerificationPreview(verificationId: number) {
	const [request] = await db.select().from(verifications).where(eq(verifications.id, verificationId));
	if (!request) return null;

	const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, request.campaignId));
	if (!campaign) return null;

	const [[profileUser], [applicant], teamRows, historyRows] = await Promise.all([
		db.select().from(users).where(eq(users.id, campaign.subjectUserId)),
		db.select().from(users).where(eq(users.id, request.requestedBy)),
		db
			.select({
				userId: managers.userId,
				roles: managers.roles,
				firstName: users.firstName,
				otherNames: users.otherNames,
				idFrontUrl: users.idFrontUrl,
				idBackUrl: users.idBackUrl,
				// Fallback when this manager has no domain `contacts` row yet (e.g. never
				// went through /verify/email) — every account still has its login email.
				authEmail: authUsers.email
			})
			.from(managers)
			.innerJoin(users, eq(managers.userId, users.id))
			.innerJoin(authUsers, eq(users.authUserId, authUsers.id))
			.where(and(eq(managers.subjectUserId, campaign.subjectUserId), eq(managers.isActive, true), isNull(managers.deletedAt))),
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
			.where(eq(verifications.campaignId, request.campaignId))
			.orderBy(desc(verifications.requestedAt))
	]);
	if (!profileUser.slug) return null; // every application gets a slug on first save

	const data = await loadPublicProfileData(profileUser.slug, { isAdmin: true });
	if (!data) return null;

	// Each team member's own phone/email (their account, not the profile subject's) —
	// one grouped query across every manager, keyed by userId.
	const teamContactRows = teamRows.length
		? await db
				.select({ userId: contacts.userId, channel: contacts.channel, value: contacts.value })
				.from(contacts)
				.where(and(inArray(contacts.userId, teamRows.map((t) => t.userId)), isNull(contacts.deletedAt)))
		: [];
	const teamContactsByUser = new Map<number, { sms?: string; email?: string }>();
	for (const c of teamContactRows) {
		const entry = teamContactsByUser.get(c.userId) ?? {};
		if (c.channel === 'sms') entry.sms = c.value;
		if (c.channel === 'email') entry.email = c.value;
		teamContactsByUser.set(c.userId, entry);
	}

	return {
		request: {
			id: request.id,
			requestedAt: request.requestedAt.toISOString(),
			outcome: request.outcome,
			notes: request.notes,
			reviewedAt: request.reviewedAt ? request.reviewedAt.toISOString() : null,
			requestedByName: applicant ? fullName(applicant) : null
		},
		data,
		iebcCertificateUrl: campaign.iebcCertificateUrl,
		team: teamRows.map((t) => {
			const roles = (t.roles ?? {}) as ManagerRoles;
			const teamContact = teamContactsByUser.get(t.userId);
			return {
				name: fullName(t),
				title: roles.title ?? null,
				nationalId: roles.nationalId ?? null,
				idFrontUrl: t.idFrontUrl,
				idBackUrl: t.idBackUrl,
				signoffComplete: signoffComplete(roles, t),
				isApplicant: t.userId === request.requestedBy,
				phone: teamContact?.sms ?? null,
				email: teamContact?.email ?? t.authEmail
			};
		}),
		requestHistory: historyRows.map((h) => ({
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
 * Admin decision on a request — re-reviewable at any time: approving sets
 * campaigns.verifiedAt (and locks the person's slug); rejecting an approved request
 * reverts it, clearing verifiedAt and taking the run back off the public pages.
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
		const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, request.campaignId));
		const [subject] = await db.select().from(users).where(eq(users.id, campaign.subjectUserId));

		if (subject.slug && !(await isSlugAvailable(subject.slug, subject.id))) {
			return { ok: false as const, error: `The URL "/${subject.slug}" was claimed by someone else. Pick a new one before approving.` };
		}

		await db.update(campaigns).set({ verifiedAt: new Date() }).where(eq(campaigns.id, request.campaignId));
	} else {
		await db.update(campaigns).set({ verifiedAt: null }).where(eq(campaigns.id, request.campaignId));
	}

	await db
		.update(verifications)
		.set({ outcome, notes: notes || null, reviewedBy: adminUserId, reviewedAt: new Date() })
		.where(eq(verifications.id, verificationId));

	await notifyUser(request.requestedBy, {
		kind: 'verification',
		title: outcome === 'approved' ? 'Your verification was approved' : 'Your verification was rejected',
		body:
			outcome === 'approved'
				? 'Congratulations — your leaders.ke verification application was approved. Your run is now live and publicly visible.'
				: `Your leaders.ke verification application was rejected.${notes ? ` Reason: ${notes}` : ''}\n\nYou can address the reason and re-submit from your dashboard.`,
		href: '/dashboard'
	});

	return { ok: true as const };
}
