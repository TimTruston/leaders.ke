// Shared by the campaign (/dashboard/[slug]/profile) and apply
// (/dashboard/apply/[id]/profile) families — apply re-exports this module, and
// getRouteLeaderContext resolves whichever param the URL carries. Claims stage
// into their own family (/dashboard/claim/[slug]/profile) instead.
import { fail } from '@sveltejs/kit';
import { redirectWithFlash } from '$lib/server/flash';
import { and, asc, count, eq, inArray, isNull, ne } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { experience, leaders, managers, positions, users } from '$lib/server/db/schema';
import { getRouteLeaderContext, requireDashboardUser } from '$lib/server/dashboard';
import { createPhantomUser, fullName, generateLeaderSlug, isSlugAvailable, slugify } from '$lib/server/leader';
import { getPendingVerification, requestVerification } from '$lib/server/verifications';
import type { Actions, PageServerLoad } from './$types';

// Election day anchors every 2027 aspirant profile's term start.
const ELECTION_DAY = new Date('2027-08-10T00:00:00+03:00');

export const load: PageServerLoad = async (event) => {
	const { domainUser } = await requireDashboardUser(event);
	const ctx = await getRouteLeaderContext(event, domainUser.id);

	const positionRows = await db
		.select()
		.from(positions)
		.where(isNull(positions.deletedAt))
		.orderBy(asc(positions.title), asc(positions.region));

	// Managers edit the leader's profile, not their own; profileUser is whoever the page is about.
	const subject = ctx?.profileUser ?? domainUser;

	const [existingExperience, otherLeadershipRows] = ctx
		? await Promise.all([
				db
					.select({ id: experience.id, type: experience.type, title: experience.title, institution: experience.institution, from: experience.startAt, to: experience.endAt })
					.from(experience)
					.where(and(eq(experience.leaderId, ctx.leader.id), isNull(experience.deletedAt)))
					.orderBy(experience.startAt),
				db
					.select({ id: leaders.id, positionTitle: positions.title, region: positions.region, description: leaders.description, from: leaders.startAt, to: leaders.endAt })
					.from(leaders)
					.innerJoin(positions, eq(leaders.positionId, positions.id))
					.where(and(eq(leaders.userId, subject.id), ne(leaders.id, ctx.leader.id), isNull(leaders.deletedAt)))
					.orderBy(leaders.startAt)
			])
		: [[], []];

	return {
		positions: positionRows.map((p) => ({
			id: p.id,
			title: p.title,
			region: p.region
		})),
		existingExperience: existingExperience.map((e) => ({
			id: e.id,
			type: e.type,
			title: e.title,
			institution: e.institution,
			from: e.from?.getFullYear() ?? null,
			to: e.to?.getFullYear() ?? null
		})),
		existingLeadership: otherLeadershipRows.map((r) => ({
			id: r.id,
			positionTitle: r.positionTitle,
			region: r.region,
			description: r.description,
			from: r.from.getFullYear(),
			to: r.to?.getFullYear() ?? null
		})),
		form: {
			firstName: subject.firstName,
			otherNames: subject.otherNames,
			bio: subject.bio ?? '',
			positionId: ctx?.leader.positionId ?? null,
			slug: subject.slug ?? null,
			hasLeader: !!ctx,
			verified: !!ctx?.leader.verifiedAt
		},
		pendingVerification: ctx ? !!(await getPendingVerification(ctx.leader.id)) : false
	};
};

type PendingExperience = { type: 'education' | 'professional'; title: string; institution: string; from: string; to: string | null };
type PendingLeadership = { positionId: number; description: string; from: string; to: string | null };

export const actions: Actions = {
	save: async (event) => {
		const { domainUser } = await requireDashboardUser(event);
		const ctx = await getRouteLeaderContext(event, domainUser.id);

		const form = await event.request.formData();
		const firstName = String(form.get('firstName') ?? '').trim();
		const otherNames = String(form.get('otherNames') ?? '').trim();
		const bio = String(form.get('bio') ?? '').trim();
		const positionId = Number(form.get('positionId') ?? 0);
		const slugInput = slugify(String(form.get('slug') ?? '').trim());

		let pendingExperience: PendingExperience[] = [];
		let pendingLeadership: PendingLeadership[] = [];
		let removedExperienceIds: number[] = [];
		let removedLeadershipIds: number[] = [];
		try {
			pendingExperience = JSON.parse(String(form.get('experienceEntries') ?? '[]'));
			pendingLeadership = JSON.parse(String(form.get('leadershipEntries') ?? '[]'));
			removedExperienceIds = JSON.parse(String(form.get('removedExperienceIds') ?? '[]'));
			removedLeadershipIds = JSON.parse(String(form.get('removedLeadershipIds') ?? '[]'));
		} catch {
			return fail(400, { error: 'Could not read the added experience entries.' });
		}

		if (!firstName || /\s/.test(firstName)) {
			return fail(400, { error: 'First name is required and must be a single word.', missingFields: ['firstName'] });
		}
		if (!otherNames) return fail(400, { error: 'Other names are required.', missingFields: ['otherNames'] });
		if (!bio) return fail(400, { error: 'Add a short bio.', missingFields: ['bio'] });
		if (!positionId) return fail(400, { error: 'Pick the elective position.', missingFields: ['positionId'] });

		const [position] = await db
			.select()
			.from(positions)
			.where(and(eq(positions.id, positionId), isNull(positions.deletedAt)));
		if (!position) return fail(400, { error: 'That position does not exist.', missingFields: ['positionId'] });

		for (const e of pendingExperience) {
			if (e.type !== 'education' && e.type !== 'professional') {
				return fail(400, { error: 'One of the added experience entries has an invalid type.' });
			}
			if (!e.title?.trim() || !e.institution?.trim()) {
				return fail(400, { error: 'Every added experience entry needs a title and institution.' });
			}
			if (!e.from) return fail(400, { error: 'Every added experience entry needs a start date.' });
			if (e.to && e.to < e.from) {
				return fail(400, { error: '"To" can\'t be before "From" for one of the added experience entries.' });
			}
		}
		const leadershipPositions = new Map<number, typeof position>();
		for (const l of pendingLeadership) {
			if (!l.positionId) return fail(400, { error: 'Pick a position for every added leadership entry.' });
			if (!l.from) return fail(400, { error: 'Every added leadership entry needs a start date.' });
			if (l.to && l.to < l.from) {
				return fail(400, { error: '"To" can\'t be before "From" for one of the added leadership entries.' });
			}
			if (!leadershipPositions.has(l.positionId)) {
				const [p] = await db
					.select()
					.from(positions)
					.where(and(eq(positions.id, l.positionId), isNull(positions.deletedAt)));
				if (!p) return fail(400, { error: 'One of the added leadership positions does not exist.' });
				leadershipPositions.set(l.positionId, p);
			}
		}

		let subjectId: number;
		let leaderId = ctx?.leader.id;

		if (ctx) {
			// The person the profile is about: the leader's own (phantom) user row —
			// separate from whichever citizen account is editing it.
			subjectId = ctx.profileUser.id;
			await db.update(users).set({ firstName, otherNames, bio }).where(eq(users.id, subjectId));

			// Verified profiles keep their seat locked; unverified ones may switch races.
			if (ctx.leader.positionId !== positionId && !ctx.leader.verifiedAt) {
				await db
					.update(leaders)
					.set({ positionId, updatedAt: new Date() })
					.where(eq(leaders.id, ctx.leader.id));
			}

			// The slug is this person's permanent URL, editable but unique; every one
			// of their leaders rows (Track Record entries) shares it since it lives on `users`.
			if (slugInput && slugInput !== ctx.profileUser.slug) {
				if (!(await isSlugAvailable(slugInput, subjectId))) {
					return fail(400, { error: `The URL "/${slugInput}" is already taken.` });
				}
				await db.update(users).set({ slug: slugInput }).where(eq(users.id, subjectId));
			}
		} else {
			// New leader: a fresh users row for the leader identity itself, never the
			// creating citizen's own — so editing this profile never touches their login
			// account. The apply route's pre-minted UUID becomes the phantom's auth id,
			// keeping /dashboard/apply/<id>/* stable across the whole application.
			const applyId = (event.params as { id?: string }).id;
			if (applyId) {
				// A pasted/guessed UUID could collide with an existing auth user — refuse
				// rather than 500 on the primary-key insert.
				const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.authUserId, applyId));
				if (taken) return fail(400, { error: 'This application link is unavailable. Start a new application from your dashboard.' });
			}
			const phantom = await createPhantomUser(firstName, otherNames, applyId);
			subjectId = phantom.id;
			await db.update(users).set({ bio }).where(eq(users.id, subjectId));

			let slug = slugInput || slugify(fullName({ firstName, otherNames }));
			if (!(await isSlugAvailable(slug, subjectId))) {
				if (slugInput) return fail(400, { error: `The URL "/${slugInput}" is already taken.` });
				slug = await generateLeaderSlug(fullName({ firstName, otherNames }));
			}
			await db.update(users).set({ slug }).where(eq(users.id, subjectId));
			const [created] = await db
				.insert(leaders)
				.values({
					userId: subjectId,
					positionId,
					status: 'aspirant',
					startAt: ELECTION_DAY
				})
				.returning({ id: leaders.id });
			leaderId = created.id;

			// onboarding.md: the creator is the campaign's first manager, with admin
			// permissions (invite/remove team, fundraising, delete campaign) — "leader"
			// isn't a separate permission tier, just the first admin manager.
			await db.insert(managers).values({
				userId: domainUser.id,
				leaderId,
				roles: { admin: true },
				verifiedAt: new Date()
			});
		}

		for (const e of pendingExperience) {
			await db.insert(experience).values({
				leaderId: leaderId!,
				type: e.type,
				title: e.title.trim(),
				institution: e.institution.trim(),
				startAt: new Date(`${e.from}T00:00:00+03:00`),
				endAt: e.to ? new Date(`${e.to}T00:00:00+03:00`) : null
			});
		}

		for (const l of pendingLeadership) {
			await db.insert(leaders).values({
				userId: subjectId,
				positionId: l.positionId,
				status: 'former',
				description: l.description?.trim() || null,
				startAt: new Date(`${l.from}T00:00:00+03:00`),
				endAt: l.to ? new Date(`${l.to}T00:00:00+03:00`) : null
			});
		}

		// Scoped to this leader/user so nobody can remove someone else's rows by id-guessing.
		if (removedExperienceIds.length > 0 && leaderId) {
			await db
				.update(experience)
				.set({ deletedAt: new Date() })
				.where(and(inArray(experience.id, removedExperienceIds), eq(experience.leaderId, leaderId)));
		}
		if (removedLeadershipIds.length > 0) {
			await db
				.update(leaders)
				.set({ deletedAt: new Date() })
				.where(and(inArray(leaders.id, removedLeadershipIds), eq(leaders.userId, subjectId), ne(leaders.id, leaderId!)));
		}

		return { saved: true };
	},

	// "Just testing" escape hatch (mirrors the claim form's Delete): soft-deletes
	// the in-progress application — its leader row and phantom user — so it drops
	// out of the switcher and its slug frees up. Verified campaigns are exempt.
	deleteApplication: async (event) => {
		const { domainUser } = await requireDashboardUser(event);
		const ctx = await getRouteLeaderContext(event, domainUser.id);
		if (!ctx) return fail(400, { verificationError: 'Nothing to delete yet.' });
		if (ctx.leader.verifiedAt) {
			return fail(400, { verificationError: 'A verified campaign cannot be deleted from here.' });
		}

		await db.update(leaders).set({ deletedAt: new Date() }).where(eq(leaders.id, ctx.leader.id));
		// The phantom identity goes with it — but never the citizen's own users row
		// (legacy self-profiles point leaders.userId at the citizen).
		if (ctx.profileUser.id !== domainUser.id) {
			await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, ctx.profileUser.id));
		}
		redirectWithFlash(event.cookies, '/dashboard', 'Application deleted.');
	},

	requestVerification: async (event) => {
		const { domainUser } = await requireDashboardUser(event);
		const ctx = await getRouteLeaderContext(event, domainUser.id);
		if (!ctx) return fail(400, { verificationError: 'Save your profile before requesting verification.' });
		if (ctx.leader.verifiedAt) return fail(400, { verificationError: 'Already verified.' });

		// onboarding.md's Team tab: a one-person "campaign" isn't credible — require at
		// least 2 active team members (the creator plus one more) before submitting.
		const [{ n: teamSize }] = await db
			.select({ n: count() })
			.from(managers)
			.where(and(eq(managers.leaderId, ctx.leader.id), eq(managers.isActive, true)));
		if (teamSize < 2) {
			return fail(400, { verificationError: 'Add at least one more team member on the Team tab before submitting.' });
		}

		// The submitter's role + national ID live on their manager row, saved from
		// the Team tab's "Your details" form — not from a submit-widget input.
		const [mine] = await db
			.select({ roles: managers.roles })
			.from(managers)
			.where(and(eq(managers.userId, domainUser.id), eq(managers.leaderId, ctx.leader.id), isNull(managers.deletedAt)));
		const myRoles = (mine?.roles ?? {}) as { title?: string; nationalId?: string };
		if (!myRoles.nationalId) {
			return fail(400, { verificationError: 'Add your role and national ID on the Team tab before submitting.' });
		}

		const form = await event.request.formData();
		const notes = String(form.get('notes') ?? '').trim();
		const result = await requestVerification(ctx.leader.id, domainUser.id, { nationalId: myRoles.nationalId, myRole: myRoles.title ?? '', notes });
		if (!result.ok) return fail(400, { verificationError: result.error });

		return { requestedVerification: true };
	}
};
