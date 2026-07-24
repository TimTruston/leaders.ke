import { fail } from '@sveltejs/kit';
import { and, count, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { followers, posts } from '$lib/server/db/schema';
import { requireLeader } from '$lib/server/dashboard';
import { fullName } from '$lib/server/leader';
import { sendEmail } from '$lib/server/email';
import { getPageSize } from '$lib/server/settings';
import type { Actions, PageServerLoad } from './$types';

// Broadcasts: compose once, send to a geo segment. Email only in v1;
// SMS/WhatsApp arrive with the credits system. Each send is logged as a
// posts row (medium 'email') so history and analytics share one table.
export const load: PageServerLoad = async (event) => {
	const { ctx } = await requireLeader(event);
	const pageSize = await getPageSize();
	const page = Math.max(1, Number(event.url.searchParams.get('page') ?? 1));

	const target = and(
		eq(followers.digest, 'leader'),
		eq(followers.digestId, ctx.profileUser.id),
		isNull(followers.deletedAt)
	);

	const historyFilter = and(eq(posts.subjectUserId, ctx.profileUser.id), eq(posts.medium, 'email'), isNull(posts.deletedAt));
	const [history, [{ n: total }], followerRows] = await Promise.all([
		db
			.select()
			.from(posts)
			.where(historyFilter)
			.orderBy(desc(posts.createdAt))
			.limit(pageSize)
			.offset((page - 1) * pageSize),
		db.select({ n: count() }).from(posts).where(historyFilter),
		db.select().from(followers).where(target)
	]);

	const reachable = followerRows.filter((f) => f.email && f.emailAddress);
	const wards = [...new Set(followerRows.map((f) => f.ward).filter(Boolean))].sort() as string[];
	const counties = [
		...new Set(followerRows.map((f) => f.county).filter(Boolean))
	].sort() as string[];

	return {
		broadcasts: history.map((b) => ({
			id: b.id,
			title: b.title,
			body: b.body,
			// manualSummary stores the audience + sent count, e.g. "ward:Kiharu · 12 sent"
			summary: b.manualSummary,
			sentAt: b.createdAt.toISOString()
		})),
		total,
		page,
		pageSize,
		audience: {
			total: followerRows.length,
			reachable: reachable.length,
			wards,
			counties
		}
	};
};

export const actions: Actions = {
	send: async (event) => {
		const { domainUser, ctx } = await requireLeader(event);
		const form = await event.request.formData();
		const subject = String(form.get('subject') ?? '').trim();
		const body = String(form.get('body') ?? '').trim();
		const audience = String(form.get('audience') ?? 'all'); // 'all' | 'county:<v>' | 'ward:<v>'
		if (!subject || !body) return fail(400, { error: 'A broadcast needs a subject and a message.' });

		const conditions = [
			eq(followers.digest, 'leader'),
			eq(followers.digestId, ctx.profileUser.id),
			isNull(followers.deletedAt),
			eq(followers.email, true),
			isNotNull(followers.emailAddress),
			// Skips a follow still pending its double opt-in (confirm-link click
			// for email, texted code for phone — see the `follow`/`confirmPhone`
			// actions on the campaign workspace page).
			isNotNull(followers.confirmedAt)
		];
		const [kind, value] = audience.split(':');
		if (kind === 'county' && value) conditions.push(eq(followers.county, value));
		if (kind === 'ward' && value) conditions.push(eq(followers.ward, value));

		const recipients = await db
			.select()
			.from(followers)
			.where(and(...conditions));

		if (recipients.length === 0) {
			return fail(400, { error: 'No reachable followers in that segment yet.' });
		}

		const senderName = fullName(ctx.profileUser);
		// Sequential sends are fine at this scale; a queue takes over with credits/SMS.
		for (const r of recipients) {
			await sendEmail({
				to: r.emailAddress!,
				subject: `${senderName}: ${subject}`,
				text: `${body}\n\n----\nYou follow ${senderName} on leaders.ke. Reply STOP to this email to opt out.`
			});
		}

		const audienceLabel = kind === 'all' ? 'all followers' : `${kind}: ${value}`;
		await db.insert(posts).values({
			creatorId: domainUser.id,
			subjectUserId: ctx.profileUser.id,
			title: subject,
			body,
			medium: 'email',
			approved: true,
			public: false,
			manualSummary: `${audienceLabel} · ${recipients.length} sent`
		});

		return { sent: recipients.length };
	}
};
