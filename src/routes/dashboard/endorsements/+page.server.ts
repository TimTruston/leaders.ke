import { fail } from '@sveltejs/kit';
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { endorsements } from '$lib/server/db/schema';
import { requireLeader } from '$lib/server/dashboard';
import type { Actions, PageServerLoad } from './$types';

// Social proof desk: citizens submit endorsements/testimonials/pledges on the
// campaign page; the team approves what shows publicly (pledges auto-count).
export const load: PageServerLoad = async (event) => {
	const { ctx } = await requireLeader(event);

	const scope = and(eq(endorsements.leaderId, ctx.leader.id), isNull(endorsements.deletedAt));

	const [rows, [pledgeRow]] = await Promise.all([
		db
			.select()
			.from(endorsements)
			.where(and(scope, eq(endorsements.kind, 'endorsement')))
			.orderBy(desc(endorsements.createdAt)),
		db
			.select({ n: count() })
			.from(endorsements)
			.where(and(scope, eq(endorsements.kind, 'pledge')))
	]);

	const testimonialRows = await db
		.select()
		.from(endorsements)
		.where(and(scope, eq(endorsements.kind, 'testimonial')))
		.orderBy(desc(endorsements.createdAt));

	const toView = (r: typeof endorsements.$inferSelect) => ({
		id: r.id,
		authorName: r.authorName,
		authorRole: r.authorRole,
		message: r.message,
		ward: r.ward,
		approved: !!r.approvedAt
	});

	return {
		endorsements: rows.map(toView),
		testimonials: testimonialRows.map(toView),
		pledgeCount: pledgeRow.n
	};
};

export const actions: Actions = {
	// The team can also add endorsements they collected offline.
	add: async (event) => {
		const { ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const kind = String(form.get('kind') ?? 'endorsement');
		const authorName = String(form.get('authorName') ?? '').trim();
		const authorRole = String(form.get('authorRole') ?? '').trim();
		const message = String(form.get('message') ?? '').trim();
		if (!authorName || !message) return fail(400, { error: 'Name and message are required.' });
		if (kind !== 'endorsement' && kind !== 'testimonial') {
			return fail(400, { error: 'Invalid kind.' });
		}

		await db.insert(endorsements).values({
			leaderId: ctx.leader.id,
			kind,
			authorName,
			authorRole: authorRole || null,
			message,
			approvedAt: new Date() // team-entered items are pre-approved
		});
		return { saved: true };
	},

	toggleApproval: async (event) => {
		const { ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const endorsementId = Number(form.get('endorsementId') ?? 0);

		const [row] = await db
			.select()
			.from(endorsements)
			.where(
				and(
					eq(endorsements.id, endorsementId),
					eq(endorsements.leaderId, ctx.leader.id),
					isNull(endorsements.deletedAt)
				)
			);
		if (!row) return fail(404, { error: 'Not found.' });

		await db
			.update(endorsements)
			.set({ approvedAt: row.approvedAt ? null : new Date() })
			.where(eq(endorsements.id, row.id));
		return { saved: true };
	},

	remove: async (event) => {
		const { ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const endorsementId = Number(form.get('endorsementId') ?? 0);

		await db
			.update(endorsements)
			.set({ deletedAt: new Date() })
			.where(and(eq(endorsements.id, endorsementId), eq(endorsements.leaderId, ctx.leader.id)));
		return { saved: true };
	}
};
