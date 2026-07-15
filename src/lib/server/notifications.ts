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
import { sendEmail } from '$lib/server/email';

export type NotificationInput = {
	kind: 'verification' | 'claim';
	title: string;
	body: string; // includes the admin's reason on rejections
	href?: string; // where the notification's "view" link lands
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
 * Writes the in-app notification and emails the recipient the same content. Email
 * failure is logged, never thrown — the decision itself already committed, and the
 * notification still surfaces on the dashboard regardless.
 */
export async function notifyUser(userId: number, input: NotificationInput) {
	await db
		.insert(notifications)
		.values({ userId, kind: input.kind, title: input.title, body: input.body, href: input.href ?? null });

	const to = await emailFor(userId);
	if (!to) return;
	try {
		await sendEmail({ to, subject: input.title, text: `${input.body}${input.href ? `\n\nView: ${input.href}` : ''}` });
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
