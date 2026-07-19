// Shared by the campaign (/dashboard/[slug]/profile) and apply
// (/dashboard/apply/[id]/profile) families — apply re-exports this module, and
// getRouteLeaderContext resolves whichever param the URL carries. Claims stage
// into their own family (/dashboard/claim/[slug]/profile) instead.
import { fail } from '@sveltejs/kit';
import { redirectWithFlash } from '$lib/server/flash';
import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, experience, leaders, managers, parties, partyMemberships, positions, users } from '$lib/server/db/schema';
import { user as authUsers } from '$lib/server/db/auth.schema';
import { getRouteLeaderContext, requireDashboardUser, requireLeader } from '$lib/server/dashboard';
import { ACTIVE_CYCLE, createPhantomUser, fullName, generateLeaderSlug, getOrCreateRunCampaign, getRunCampaign, isSlugAvailable, slugify } from '$lib/server/leader';
import { getPendingVerification, requestVerification } from '$lib/server/verifications';
import { getPlatformSettings } from '$lib/server/settings';
import { saveLeaderDocument, type UploadKind } from '$lib/server/storage';
import { signoffComplete, type ManagerRoles } from '$lib/utils/campaignRoles';
import type { Actions, PageServerLoad } from './$types';

// The photo rides the ?/save submit itself (multipart) and lands on the PERSON
// (users.photoUrl — it follows them across terms and runs).

export const load: PageServerLoad = async (event) => {
	const { domainUser } = await requireDashboardUser(event);
	const ctx = await getRouteLeaderContext(event, domainUser.id);

	const positionRows = await db
		.select()
		.from(positions)
		.where(isNull(positions.deletedAt))
		.orderBy(asc(positions.title), asc(positions.region));

	const partyRows = await db
		.select({ id: parties.id, name: parties.name, abbreviation: parties.abbreviation })
		.from(parties)
		.where(isNull(parties.deletedAt))
		.orderBy(asc(parties.name));

	// The leader's live party membership (endAt null) feeds the Party select;
	// null = independent/none.
	let partyId: number | null = null;
	if (ctx) {
		const [membership] = await db
			.select({ partyId: partyMemberships.partyId })
			.from(partyMemberships)
			.where(and(eq(partyMemberships.subjectUserId, ctx.profileUser.id), isNull(partyMemberships.deletedAt), isNull(partyMemberships.endAt)));
		partyId = membership?.partyId ?? null;
	}

	// Managers edit the leader's profile, not their own; profileUser is whoever the page is about.
	const subject = ctx?.profileUser ?? domainUser;

	const [existingExperience, otherLeadershipRows] = ctx
		? await Promise.all([
				db
					.select({ id: experience.id, type: experience.type, title: experience.title, institution: experience.institution, description: experience.description, from: experience.startAt, to: experience.endAt })
					.from(experience)
					.where(and(eq(experience.subjectUserId, subject.id), isNull(experience.deletedAt)))
					.orderBy(experience.startAt),
				db
					.select({ id: leaders.id, positionTitle: positions.title, region: positions.region, description: leaders.description, from: leaders.startAt, to: leaders.endAt })
					.from(leaders)
					.innerJoin(positions, eq(leaders.positionId, positions.id))
					.where(and(eq(leaders.userId, subject.id), ne(leaders.id, ctx.leader?.id ?? 0), isNull(leaders.deletedAt)))
					.orderBy(leaders.startAt)
			])
		: [[], []];

	// Verification + IEBC cert live on the person's run (campaign), not a held term.
	const runCampaign = ctx ? await getRunCampaign(ctx.profileUser.id) : null;

	return {
		positions: positionRows.map((p) => ({
			id: p.id,
			title: p.title,
			region: p.region
		})),
		parties: partyRows.map((p) => ({
			id: p.id,
			name: p.abbreviation ? `${p.name} (${p.abbreviation})` : p.name
		})),
		existingExperience: existingExperience.map((e) => ({
			id: e.id,
			type: e.type,
			title: e.title,
			institution: e.institution,
			description: e.description,
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
			positionId: ctx?.position?.id ?? null,
			partyId,
			slug: subject.slug ?? null,
			hasLeader: !!ctx,
			verified: (ctx?.verified ?? false)
		},
		// The photo is edited on this tab (staged client-side, uploaded with ?/save).
		photoUrl: ctx?.profileUser.photoUrl ?? null,
		pendingVerification: runCampaign ? !!(await getPendingVerification(runCampaign.id)) : false
	};
};

type PendingExperience = { type: 'education' | 'professional'; title: string; institution: string; description?: string; from: string; to: string | null };
type PendingLeadership = { positionId: number; description: string; from: string; to: string | null };

export const actions: Actions = {
	save: async (event) => {
		const { domainUser } = await requireDashboardUser(event);
		const ctx = await getRouteLeaderContext(event, domainUser.id);

		const form = await event.request.formData();
		const firstName = String(form.get('firstName') ?? '').trim();
		const otherNames = String(form.get('otherNames') ?? '').trim();
		const bio = String(form.get('bio') ?? '').trim();
		const partyId = Number(form.get('partyId') ?? 0) || null; // null = independent
		const slugInput = slugify(String(form.get('slug') ?? '').trim());

		// Staged photo rides this same submit. Validate it up front so a bad file
		// fails the save cleanly before anything is written.
		const photoFile = form.get('photo');
		const hasPhoto = photoFile instanceof File && photoFile.size > 0;
		if (hasPhoto) {
			if (photoFile.size > 10 * 1024 * 1024) return fail(400, { error: 'The photo is larger than 10 MB.' });
			if (!['image/jpeg', 'image/png', 'image/webp'].includes(photoFile.type)) {
				return fail(400, { error: 'The photo must be a JPEG, PNG, or WebP image.' });
			}
		}

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
		// The seat contested is no longer part of this form — the run (seat + cycle)
		// is declared on the Campaign tab.

		if (partyId) {
			const [party] = await db
				.select({ id: parties.id })
				.from(parties)
				.where(and(eq(parties.id, partyId), isNull(parties.deletedAt)));
			if (!party) return fail(400, { error: 'That party does not exist.' });
		}

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
			if (e.description && e.description.trim().length > 500) {
				return fail(400, { error: 'Experience descriptions are limited to 500 characters.' });
			}
		}
		const leadershipPositions = new Map<number, typeof positions.$inferSelect>();
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
		let leaderId = ctx?.leader?.id;

		if (ctx) {
			// The person the profile is about: the leader's own (phantom) user row —
			// separate from whichever citizen account is editing it.
			subjectId = ctx.profileUser.id;
			await db.update(users).set({ firstName, otherNames, bio }).where(eq(users.id, subjectId));

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
			// No campaign yet: the run (seat + cycle + manifesto title) is declared on
			// the Campaign tab. This save only creates the person.

			// onboarding.md: the creator is the campaign's first manager, with admin
			// permissions (invite/remove team, fundraising, delete campaign) — "leader"
			// isn't a separate permission tier, just the first admin manager.
			await db.insert(managers).values({
				userId: domainUser.id,
				subjectUserId: subjectId,
				roles: { admin: true },
				verifiedAt: new Date()
			});
		}

		// Party membership is a person-level timeline: one live row (endAt null) per
		// person. A change ends the current row and starts a new one — the dated
		// history of switches is kept. Aspirants (no leaders row) set party too.
		const [currentMembership] = await db
			.select({ id: partyMemberships.id, partyId: partyMemberships.partyId })
			.from(partyMemberships)
			.where(and(eq(partyMemberships.subjectUserId, subjectId), isNull(partyMemberships.deletedAt), isNull(partyMemberships.endAt)));
		if ((currentMembership?.partyId ?? null) !== partyId) {
			if (currentMembership) {
				await db
					.update(partyMemberships)
					.set({ endAt: new Date(), updatedAt: new Date() })
					.where(eq(partyMemberships.id, currentMembership.id));
			}
			if (partyId) {
				await db.insert(partyMemberships).values({ partyId, subjectUserId: subjectId, role: 'Member', startAt: new Date() });
			}
		}

		for (const e of pendingExperience) {
			await db.insert(experience).values({
				subjectUserId: subjectId,
				type: e.type,
				title: e.title.trim(),
				institution: e.institution.trim(),
				description: e.description?.trim() || null,
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

		// Scoped to this person so nobody can remove someone else's rows by id-guessing.
		if (removedExperienceIds.length > 0) {
			await db
				.update(experience)
				.set({ deletedAt: new Date() })
				.where(and(inArray(experience.id, removedExperienceIds), eq(experience.subjectUserId, subjectId)));
		}
		if (removedLeadershipIds.length > 0) {
			await db
				.update(leaders)
				.set({ deletedAt: new Date() })
				.where(and(inArray(leaders.id, removedLeadershipIds), eq(leaders.userId, subjectId), ne(leaders.id, leaderId!)));
		}

		// The staged photo, validated above: written to disk keyed by the PERSON and
		// wired onto their users row — part of this same save, no separate upload step.
		if (hasPhoto) {
			try {
				const photoUrl = await saveLeaderDocument(subjectId, 'photo', photoFile);
				await db.update(users).set({ photoUrl }).where(eq(users.id, subjectId));
			} catch (err) {
				return fail(400, { error: err instanceof Error ? err.message : 'Photo upload failed.' });
			}
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
		if (ctx.verified) {
			return fail(400, { verificationError: 'A verified campaign cannot be deleted from here.' });
		}

		// A run application soft-deletes its campaign; a held-term one its leaders row.
		if (ctx.leader) {
			await db.update(leaders).set({ deletedAt: new Date() }).where(eq(leaders.id, ctx.leader.id));
		} else {
			await db
				.update(campaigns)
				.set({ deletedAt: new Date() })
				.where(and(eq(campaigns.subjectUserId, ctx.profileUser.id), eq(campaigns.cycleYear, ACTIVE_CYCLE), isNull(campaigns.parentCampaignId), isNull(campaigns.deletedAt)));
		}
		// The team's manager rows retire with the application (else the switcher and
		// context fallbacks keep resolving a dead profile).
		await db.update(managers).set({ deletedAt: new Date() }).where(eq(managers.subjectUserId, ctx.profileUser.id));
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
		// Verification is for the run (campaign), declared on the Campaign tab first.
		const run = await getRunCampaign(ctx.profileUser.id);
		if (!run) return fail(400, { verificationError: 'Set up your campaign (seat + cycle) on the Campaign tab first.' });
		if (run.verifiedAt) return fail(400, { verificationError: 'Already verified.' });

		// The two verification gates are admin-tunable (Platform settings): a credible
		// campaign needs enough email-verified managers, enough of whom have each
		// completed their own sign-off (role + national ID + ID images) on the Team tab.
		const settings = await getPlatformSettings();
		const managerRows = await db
			.select({ userId: managers.userId, roles: managers.roles, emailVerified: authUsers.emailVerified, idFrontUrl: users.idFrontUrl, idBackUrl: users.idBackUrl })
			.from(managers)
			.innerJoin(users, eq(managers.userId, users.id))
			.innerJoin(authUsers, eq(users.authUserId, authUsers.id))
			.where(and(eq(managers.subjectUserId, ctx.profileUser.id), eq(managers.isActive, true), isNull(managers.deletedAt)));

		const verifiedManagers = managerRows.filter((m) => m.emailVerified).length;
		if (verifiedManagers < settings.requiredTeamManagers) {
			return fail(400, {
				verificationError: `Add at least ${settings.requiredTeamManagers} verified team members on the Team tab before submitting.`
			});
		}

		const completedSignoffs = managerRows.filter((m) => signoffComplete(m.roles as ManagerRoles, m)).length;
		if (completedSignoffs < settings.requiredSignoffs) {
			return fail(400, {
				verificationError: `${settings.requiredSignoffs} completed team sign-off${settings.requiredSignoffs === 1 ? '' : 's'} required — finish your sign-off on the Team tab before submitting.`
			});
		}

		// The submitter's own role + national ID travel with the request as evidence.
		const myRoles = (managerRows.find((m) => m.userId === domainUser.id)?.roles ?? {}) as ManagerRoles;

		const form = await event.request.formData();
		const notes = String(form.get('notes') ?? '').trim();
		const result = await requestVerification(run.id, domainUser.id, { nationalId: myRoles.nationalId ?? '', myRole: myRoles.title ?? '', notes });
		if (!result.ok) return fail(400, { verificationError: result.error });

		return { requestedVerification: true };
	}
};
