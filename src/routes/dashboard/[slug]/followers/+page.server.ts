import { fail } from '@sveltejs/kit';
import { and, desc, eq, gte, isNull, count } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { followers } from '$lib/server/db/schema';
import { requireLeader } from '$lib/server/dashboard';
import { createInvite, listOpenInvites } from '$lib/server/invites';
import { addCitizenFollower } from '$lib/server/ambassador';
import { getPageSize } from '$lib/server/settings';
import type { Actions, PageServerLoad } from './$types';

// Follower roster with geo segments; geo values feed the broadcast targeting UI too.
// Ward filtering happens server-side so it composes correctly with pagination.
export const load: PageServerLoad = async (event) => {
	const { ctx } = await requireLeader(event);
	const pageSize = await getPageSize();

	const target = and(
		eq(followers.digest, 'leader'),
		eq(followers.digestId, ctx.profileUser.id),
		isNull(followers.deletedAt)
	);

	const ward = event.url.searchParams.get('ward') || null;
	const page = Math.max(1, Number(event.url.searchParams.get('page') ?? 1));
	const filtered = ward ? and(target, eq(followers.ward, ward)) : target;

	const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

	const [rows, [weekRow], [totalRow], wardRows, openInvites] = await Promise.all([
		db
			.select()
			.from(followers)
			.where(filtered)
			.orderBy(desc(followers.createdAt))
			.limit(pageSize)
			.offset((page - 1) * pageSize),
		db.select({ n: count() }).from(followers).where(and(target, gte(followers.createdAt, weekAgo))),
		db.select({ n: count() }).from(followers).where(filtered),
		db.selectDistinct({ ward: followers.ward }).from(followers).where(target),
		listOpenInvites(ctx.profileUser.id)
	]);

	return {
		followers: rows.map((f) => ({
			id: f.id,
			name: f.name ?? 'Follower',
			email: f.emailAddress,
			phone: f.phoneNumber,
			county: f.county,
			ward: f.ward,
			channels: [f.email && 'email', f.sms && 'sms', f.whatsapp && 'whatsapp'].filter(
				Boolean
			) as string[],
			joinedAt: f.createdAt.toISOString()
		})),
		newThisWeek: weekRow.n,
		total: totalRow.n,
		page,
		pageSize,
		ward,
		wards: wardRows.map((w) => w.ward).filter((w): w is string => !!w).sort(),
		followerInvites: openInvites.filter((i) => i.role === 'follower')
	};
};

export const actions: Actions = {
	inviteFollower: async (event) => {
		const { domainUser, ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const email = String(form.get('email') ?? '').trim();
		if (!email) return fail(400, { error: 'Enter an email address to invite.' });

		await createInvite(ctx.profileUser.id, 'follower', domainUser.id, email, event.url.origin);
		return { invited: { email } };
	},

	// Same add-a-citizen flow ambassadors have on /dashboard/mobilize — managers
	// recruit too (blueprint funnel A), attributed via followers.addedBy.
	addFollower: async (event) => {
		const { domainUser, ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const result = await addCitizenFollower(domainUser.id, (ctx.leader?.id ?? 0), {
			name: String(form.get('name') ?? ''),
			phone: String(form.get('phone') ?? ''),
			email: String(form.get('email') ?? ''),
			county: String(form.get('county') ?? '').trim() || null,
			ward: String(form.get('ward') ?? '').trim() || null
		});
		if (!result.ok) return fail(400, { error: result.error });
		return { added: { name: result.name } };
	}
};
