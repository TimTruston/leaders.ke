// The Profile tab for a leader's own dashboard (/dashboard/[slug]/profile) —
// covers both an unverified profile still being assembled and a verified one.
import { fail } from '@sveltejs/kit';
import { redirectWithFlash } from '$lib/server/flash';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, experience, leaders, managers, parties, positions, users } from '$lib/server/db/schema';
import { getRouteLeaderContext, requireDashboardUser, requireLeader } from '$lib/server/dashboard';
import { ACTIVE_CYCLE, createPhantomUser, fullName, getApplicationChecklist, isSlugAvailable, slugify } from '$lib/server/leader';
import { saveLeaderDocument, type UploadKind } from '$lib/server/storage';
import { notifyAdminsOfVerificationRequest } from '$lib/server/profiles';
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
					.select({
						id: leaders.id,
						positionTitle: positions.title,
						region: positions.region,
						description: leaders.description,
						from: leaders.startAt,
						to: leaders.endAt,
						partyId: leaders.partyId,
						partyName: parties.name
					})
					.from(leaders)
					.innerJoin(positions, eq(leaders.positionId, positions.id))
					.leftJoin(parties, eq(leaders.partyId, parties.id))
					.where(and(eq(leaders.userId, subject.id), isNull(leaders.deletedAt)))
					.orderBy(leaders.startAt)
			])
		: [[], []];

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
			to: r.to?.getFullYear() ?? null,
			partyId: r.partyId,
			partyName: r.partyName
		})),
		form: {
			firstName: subject.firstName,
			otherNames: subject.otherNames,
			bio: subject.bio ?? '',
			positionId: ctx?.position?.id ?? null,
			slug: subject.slug ?? null,
			hasLeader: !!ctx,
			verified: (ctx?.verified ?? false)
		},
		// The photo is edited on this tab (staged client-side, uploaded with ?/save).
		photoUrl: ctx?.profileUser.photoUrl ?? null
	};
};

type PendingExperience = { type: 'education' | 'professional'; title: string; institution: string; description?: string; from: string; to: string | null };
type PendingLeadership = { positionId: number; partyId: number | null; description: string; from: string; to: string | null };

export const actions: Actions = {
	save: async (event) => {
		const { domainUser } = await requireDashboardUser(event);
		const ctx = await getRouteLeaderContext(event, domainUser.id);

		const form = await event.request.formData();
		const firstName = String(form.get('firstName') ?? '').trim();
		const otherNames = String(form.get('otherNames') ?? '').trim();
		const bio = String(form.get('bio') ?? '').trim();
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
		// is declared on the Campaign tab. Party isn't edited at the top level either —
		// every held term (current or former) is a Track Record entry added via
		// "+ Elected" below, each carrying its own party.

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
			// account. Reachable only if a profile is somehow missing its slug/manager
			// by the time someone edits it here — onboarding (createProfile/linkProfile)
			// already sets both up before anyone reaches this route.
			const phantom = await createPhantomUser(firstName, otherNames);
			subjectId = phantom.id;
			await db.update(users).set({ bio }).where(eq(users.id, subjectId));

			// onboarding.md: the creator is the campaign's first manager, with admin
			// permissions (invite/remove team, fundraising, delete campaign) — "leader"
			// isn't a separate permission tier, just the first admin manager.
			await db.insert(managers).values({
				userId: domainUser.id,
				subjectUserId: subjectId,
				roles: { admin: true }
			});
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
				partyId: l.partyId,
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
				.where(and(inArray(leaders.id, removedLeadershipIds), eq(leaders.userId, subjectId)));
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

	// "Submit for Verification": re-checks the checklist server-side (never trust
	// the client's view of "complete") and, only if every tab is done, emails the
	// admins — there's no submit/pending state to flip, just a heads-up that this
	// one's ready for the admin's Verify Profile toggle. users.verificationRequestedAt
	// records the click so the dashboard can show "pending review" and this can't
	// re-email admins on every subsequent click. Decoupled from any campaign —
	// campaigns are optional and verified individually on the Campaign tab.
	requestVerification: async (event) => {
		const { domainUser } = await requireDashboardUser(event);
		const ctx = await getRouteLeaderContext(event, domainUser.id);
		if (!ctx) return fail(400, { verificationError: 'Nothing to submit yet.' });
		if (ctx.profileUser.profileVerifiedAt) return fail(400, { verificationError: 'This profile is already verified.' });

		const { applicationComplete, verificationRequestedAt } = await getApplicationChecklist(ctx);
		if (verificationRequestedAt) return fail(400, { verificationError: 'Already submitted — it\'s pending admin review.' });
		if (!applicationComplete) return fail(400, { verificationError: 'Some required fields are still missing.' });

		await db.update(users).set({ verificationRequestedAt: new Date() }).where(eq(users.id, ctx.profileUser.id));
		await notifyAdminsOfVerificationRequest(ctx.profileUser.id);
		return { requested: true };
	}
};
