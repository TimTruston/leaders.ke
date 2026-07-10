import { fail } from '@sveltejs/kit';
import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { experience, leaders, positions, users } from '$lib/server/db/schema';
import { requireDashboardUser } from '$lib/server/dashboard';
import { fullName, generateLeaderSlug, getLeaderContext, isSlugAvailable, slugify } from '$lib/server/leader';
import type { Actions, PageServerLoad } from './$types';

// Election day anchors every 2027 aspirant profile's term start.
const ELECTION_DAY = new Date('2027-08-10T00:00:00+03:00');

export const load: PageServerLoad = async (event) => {
	const { domainUser } = await requireDashboardUser(event);
	const ctx = await getLeaderContext(domainUser.id);

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
					.select({ id: experience.id, type: experience.type, title: experience.title, institution: experience.institution, from: experience.from, to: experience.to })
					.from(experience)
					.where(and(eq(experience.leaderId, ctx.leader.id), isNull(experience.deletedAt)))
					.orderBy(experience.from),
				db
					.select({ id: leaders.id, positionTitle: positions.title, region: positions.region, description: leaders.description, from: leaders.from, to: leaders.to })
					.from(leaders)
					.innerJoin(positions, eq(leaders.positionId, positions.id))
					.where(and(eq(leaders.userId, subject.id), ne(leaders.id, ctx.leader.id), isNull(leaders.deletedAt)))
					.orderBy(leaders.from)
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
		}
	};
};

type PendingExperience = { type: 'education' | 'professional'; title: string; institution: string; from: string; to: string | null };
type PendingLeadership = { positionId: number; description: string; from: string; to: string | null };

export const actions: Actions = {
	save: async (event) => {
		const { domainUser } = await requireDashboardUser(event);
		const ctx = await getLeaderContext(domainUser.id);

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
			return fail(400, { error: 'First name is required and must be a single word.' });
		}
		if (!otherNames) return fail(400, { error: 'Other names are required.' });
		if (!positionId) return fail(400, { error: 'Pick the position you are vying for.' });

		const [position] = await db
			.select()
			.from(positions)
			.where(and(eq(positions.id, positionId), isNull(positions.deletedAt)));
		if (!position) return fail(400, { error: 'That position does not exist.' });

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

		// The person the profile is about: the leader's user when managing, else yourself.
		const subjectId = ctx?.profileUser.id ?? domainUser.id;
		await db
			.update(users)
			.set({ firstName, otherNames, bio })
			.where(eq(users.id, subjectId));

		let leaderId = ctx?.leader.id;

		if (ctx) {
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
			let slug = slugInput || slugify(fullName({ firstName, otherNames }));
			if (!(await isSlugAvailable(slug, subjectId))) {
				if (slugInput) return fail(400, { error: `The URL "/${slugInput}" is already taken.` });
				slug = await generateLeaderSlug(fullName({ firstName, otherNames }));
			}
			await db.update(users).set({ slug }).where(eq(users.id, subjectId));
			const [created] = await db
				.insert(leaders)
				.values({
					userId: domainUser.id,
					positionId,
					status: 'aspirant',
					from: ELECTION_DAY
				})
				.returning({ id: leaders.id });
			leaderId = created.id;
		}

		for (const e of pendingExperience) {
			await db.insert(experience).values({
				leaderId: leaderId!,
				type: e.type,
				title: e.title.trim(),
				institution: e.institution.trim(),
				from: new Date(`${e.from}T00:00:00+03:00`),
				to: e.to ? new Date(`${e.to}T00:00:00+03:00`) : null
			});
		}

		for (const l of pendingLeadership) {
			await db.insert(leaders).values({
				userId: subjectId,
				positionId: l.positionId,
				status: 'former',
				description: l.description?.trim() || null,
				from: new Date(`${l.from}T00:00:00+03:00`),
				to: l.to ? new Date(`${l.to}T00:00:00+03:00`) : null
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
	}
};
