// The Delivery tab (/dashboard/[slug]/delivery) — what a leader lists as delivered
// under a SPECIFIC term (current or a past one from Elected experience) OR a
// non-elective experience (a professional/education role). Distinct from a
// campaign RUN's forward-looking manifesto pillars (see the Campaign tab): this is
// retrospective, tied to `leaders.id` or `experience.id`, not `campaigns.id`. Each
// add/remove/pin saves immediately — no deferred/batched save.
import { fail } from '@sveltejs/kit';
import { and, asc, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { deliveries, experience, leaders, positions } from '$lib/server/db/schema';
import { requireLeader } from '$lib/server/dashboard';
import type { Actions, PageServerLoad } from './$types';

// Only PINNED deliveries show on the public profile — a leader curates their best
// out of however many they've logged, so the public page never has to guess which
// ones matter. Enforced here, not a DB constraint (same convention as elsewhere).
// Not exported — SvelteKit route files only allow specific named exports
// (load/actions/etc.), anything else 500s at build time.
const MAX_PINNED = 5;

// Encodes which table a delivery attaches to in one form value: "leader:123" or
// "experience:45" — parsed back out in the `add` action.
function parseTarget(raw: string): { kind: 'leader' | 'experience'; id: number } | null {
	const [kind, idRaw] = raw.split(':');
	const id = Number(idRaw) || 0;
	if ((kind !== 'leader' && kind !== 'experience') || !id) return null;
	return { kind, id };
}

/** This person's own leaders/experience ids — every action below scopes a
 * delivery to one of these before touching it, so nobody can act on someone
 * else's row by id-guessing. */
async function ownIds(subjectUserId: number) {
	const [ownLeaders, ownExperience] = await Promise.all([
		db.select({ id: leaders.id }).from(leaders).where(and(eq(leaders.userId, subjectUserId), isNull(leaders.deletedAt))),
		db.select({ id: experience.id }).from(experience).where(and(eq(experience.subjectUserId, subjectUserId), isNull(experience.deletedAt)))
	]);
	return { leaderIds: ownLeaders.map((l) => l.id), experienceIds: ownExperience.map((e) => e.id) };
}

export const load: PageServerLoad = async (event) => {
	const { ctx } = await requireLeader(event);

	const [termRows, experienceRows] = await Promise.all([
		db
			.select({ id: leaders.id, status: leaders.status, positionTitle: positions.title, region: positions.region, from: leaders.startAt, to: leaders.endAt })
			.from(leaders)
			.innerJoin(positions, eq(leaders.positionId, positions.id))
			.where(and(eq(leaders.userId, ctx.profileUser.id), isNull(leaders.deletedAt)))
			.orderBy(desc(leaders.startAt)),
		db
			.select({ id: experience.id, type: experience.type, title: experience.title, institution: experience.institution, from: experience.startAt, to: experience.endAt })
			.from(experience)
			.where(and(eq(experience.subjectUserId, ctx.profileUser.id), isNull(experience.deletedAt)))
			.orderBy(desc(experience.startAt))
	]);

	const targets = [
		...termRows.map((t) => ({ target: `leader:${t.id}`, label: `${t.positionTitle}, ${t.region}`, from: t.from.getFullYear(), to: t.to?.getFullYear() ?? null })),
		...experienceRows.map((e) => ({ target: `experience:${e.id}`, label: `${e.title}, ${e.institution}`, from: e.from?.getFullYear() ?? null, to: e.to?.getFullYear() ?? null }))
	];

	const [leaderIds, experienceIds] = [termRows.map((t) => t.id), experienceRows.map((e) => e.id)];
	const [deliveriesByLeader, deliveriesByExperience] = await Promise.all([
		leaderIds.length
			? db.select({ id: deliveries.id, leaderId: deliveries.leaderId, title: deliveries.title, description: deliveries.description, pinnedAt: deliveries.pinnedAt }).from(deliveries).where(and(inArray(deliveries.leaderId, leaderIds), isNull(deliveries.deletedAt))).orderBy(asc(deliveries.createdAt))
			: [],
		experienceIds.length
			? db.select({ id: deliveries.id, experienceId: deliveries.experienceId, title: deliveries.title, description: deliveries.description, pinnedAt: deliveries.pinnedAt }).from(deliveries).where(and(inArray(deliveries.experienceId, experienceIds), isNull(deliveries.deletedAt))).orderBy(asc(deliveries.createdAt))
			: []
	]);

	const allDeliveries = [
		...deliveriesByLeader.map((d) => ({ id: d.id, target: `leader:${d.leaderId}`, title: d.title, description: d.description, pinned: !!d.pinnedAt })),
		...deliveriesByExperience.map((d) => ({ id: d.id, target: `experience:${d.experienceId}`, title: d.title, description: d.description, pinned: !!d.pinnedAt }))
	];

	return {
		targets,
		deliveries: allDeliveries,
		pinnedCount: allDeliveries.filter((d) => d.pinned).length,
		maxPinned: MAX_PINNED
	};
};

export const actions: Actions = {
	add: async (event) => {
		const { ctx } = await requireLeader(event);
		const form = await event.request.formData();

		const parsed = parseTarget(String(form.get('target') ?? ''));
		const title = String(form.get('title') ?? '').trim();
		const description = String(form.get('description') ?? '').trim();

		if (!parsed) return fail(400, { error: 'Choose which term or experience this delivery belongs to.' });
		if (!title) return fail(400, { error: 'Every delivery needs a title.' });
		if (description.length > 1000) return fail(400, { error: 'Delivery descriptions are limited to 1000 characters.' });

		// The target must actually belong to this person — never trust the id
		// straight off the client.
		if (parsed.kind === 'leader') {
			const [term] = await db.select({ id: leaders.id }).from(leaders).where(and(eq(leaders.id, parsed.id), eq(leaders.userId, ctx.profileUser.id), isNull(leaders.deletedAt)));
			if (!term) return fail(400, { error: 'That term is not yours.' });
			await db.insert(deliveries).values({ leaderId: term.id, title, description: description || null });
		} else {
			const [exp] = await db.select({ id: experience.id }).from(experience).where(and(eq(experience.id, parsed.id), eq(experience.subjectUserId, ctx.profileUser.id), isNull(experience.deletedAt)));
			if (!exp) return fail(400, { error: 'That experience entry is not yours.' });
			await db.insert(deliveries).values({ experienceId: exp.id, title, description: description || null });
		}

		return { saved: true };
	},

	remove: async (event) => {
		const { ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const id = Number(form.get('id') ?? 0);
		if (!id) return fail(400, { error: 'Nothing to remove.' });

		const { leaderIds, experienceIds } = await ownIds(ctx.profileUser.id);
		const [target] = await db.select({ id: deliveries.id, leaderId: deliveries.leaderId, experienceId: deliveries.experienceId }).from(deliveries).where(eq(deliveries.id, id));
		const owned = target && ((target.leaderId && leaderIds.includes(target.leaderId)) || (target.experienceId && experienceIds.includes(target.experienceId)));
		if (!owned) return fail(400, { error: 'That delivery is not yours to remove.' });

		await db.update(deliveries).set({ deletedAt: new Date() }).where(eq(deliveries.id, id));

		return { saved: true };
	},

	togglePin: async (event) => {
		const { ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const id = Number(form.get('id') ?? 0);
		if (!id) return fail(400, { error: 'Nothing to pin.' });

		const { leaderIds, experienceIds } = await ownIds(ctx.profileUser.id);
		const [target] = await db.select({ id: deliveries.id, leaderId: deliveries.leaderId, experienceId: deliveries.experienceId, pinnedAt: deliveries.pinnedAt }).from(deliveries).where(and(eq(deliveries.id, id), isNull(deliveries.deletedAt)));
		const owned = target && ((target.leaderId && leaderIds.includes(target.leaderId)) || (target.experienceId && experienceIds.includes(target.experienceId)));
		if (!owned) return fail(400, { error: 'That delivery is not yours to pin.' });

		if (target.pinnedAt) {
			await db.update(deliveries).set({ pinnedAt: null }).where(eq(deliveries.id, id));
			return { saved: true };
		}

		// Cap enforced here, not a DB constraint — count this person's OTHER
		// currently-pinned deliveries across every term/experience.
		const pinnedElsewhere = await db
			.select({ id: deliveries.id })
			.from(deliveries)
			.where(and(isNotNull(deliveries.pinnedAt), isNull(deliveries.deletedAt), inArray(deliveries.leaderId, leaderIds.length ? leaderIds : [-1])));
		const pinnedElsewhereExp = await db
			.select({ id: deliveries.id })
			.from(deliveries)
			.where(and(isNotNull(deliveries.pinnedAt), isNull(deliveries.deletedAt), inArray(deliveries.experienceId, experienceIds.length ? experienceIds : [-1])));
		if (pinnedElsewhere.length + pinnedElsewhereExp.length >= MAX_PINNED) {
			return fail(400, { error: `You can only pin up to ${MAX_PINNED} deliveries — unpin one first.` });
		}

		await db.update(deliveries).set({ pinnedAt: new Date() }).where(eq(deliveries.id, id));
		return { saved: true };
	}
};
