// Durable per-user notifications: one call writes the in-app notification (bannered
// on the recipient's dashboard until dismissed) AND sends the matching email. Used
// for decisions that happen outside the recipient's own session — application
// approvals/rejections — where the flash cookie can't reach them. The email is
// transactional (it's about the recipient's own request), so it bypasses
// notificationPrefs, which gates broadcast-style noise, not decisions on things
// the user asked for.
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { notifications, users } from '$lib/server/db/schema';
import { user as authUsers } from '$lib/server/db/auth.schema';
import { sendEmail, stripLinks, toAbsoluteLinks } from '$lib/server/email';

export type NotificationInput = {
	kind: 'verification' | 'claim';
	title: string;
	body: string; // includes the admin's reason on rejections; may embed its own
	// <a href="/relative-path">label</a> links (relative — same-origin in-app)
	href?: string; // the primary action link (relative path)
	linkLabel?: string; // anchor text for the auto-appended href link
};

/** The recipient's login email (better-auth user bridged via users.authUserId). */
async function emailFor(userId: number): Promise<string | null> {
	const [row] = await db
		.select({ email: authUsers.email })
		.from(users)
		.innerJoin(authUsers, eq(users.authUserId, authUsers.id))
		.where(eq(users.id, userId));
	return row?.email ?? null;
}

/**
 * Writes the in-app notification and emails the recipient the same content. The
 * href (if any) becomes a "Click here…" link appended to the body itself — stored
 * with a relative path (the dashboard's own @html render is same-origin), rewritten
 * to an absolute URL for the emailed copy (HTML, with a plain-text fallback for
 * clients that don't render it). Email failure is logged, never thrown — the
 * decision itself already committed, and the notification still surfaces on the
 * dashboard regardless.
 */
export async function notifyUser(userId: number, input: NotificationInput) {
	const label = input.linkLabel ?? 'Click here to access your dashboard';
	const body = input.href ? `${input.body}\n<a href="${input.href}">${label}</a>` : input.body;

	await db.insert(notifications).values({ userId, kind: input.kind, title: input.title, body, href: input.href ?? null });

	const to = await emailFor(userId);
	if (!to) return;
	const html = toAbsoluteLinks(body).replace(/\n/g, '<br>');
	try {
		await sendEmail({ to, subject: input.title, text: stripLinks(toAbsoluteLinks(body)), html });
	} catch (error) {
		console.error(`notification email to user ${userId} failed`, error);
	}
}

export type Notification = {
	id: number;
	kind: string;
	title: string;
	body: string;
	href: string | null;
	createdAt: string;
};

/** Unread notifications for the dashboard banner, oldest first so decisions read in order. */
export async function listUnreadNotifications(userId: number): Promise<Notification[]> {
	const rows = await db
		.select()
		.from(notifications)
		.where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
		.orderBy(notifications.createdAt);
	return rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, href: r.href, createdAt: r.createdAt.toISOString() }));
}

/** Dismisses notifications — only the caller's own, so one user can't clear another's. */
export async function markNotificationsRead(userId: number, ids: number[]) {
	if (ids.length === 0) return;
	await db
		.update(notifications)
		.set({ readAt: new Date() })
		.where(and(eq(notifications.userId, userId), inArray(notifications.id, ids), isNull(notifications.readAt)));
}
