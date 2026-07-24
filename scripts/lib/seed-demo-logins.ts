// Grants a REAL, loginable account to specific already-seeded phantom-leader
// profiles (see createPhantomUser in $lib/server/leader) — a demo-only convenience
// so a specific notable person can log in and see their own dashboard directly,
// instead of the seed's placeholder @seed.leaders.ke address with no credential at
// all. Shares ADMIN_PASSWORD (the dev-admin's own password, already in .env) as a
// starting password for convenience — whoever hands over access should tell the
// recipient to change it. Idempotent: safe to rerun, upserts the credential rather
// than erroring if one already exists.
import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { managers, users } from '../../src/lib/server/db/schema';
import { user as authUsers, account } from '../../src/lib/server/db/auth.schema';
import type { AnyDb } from './names';

export const DEMO_LOGINS: { slug: string; email: string }[] = [{ slug: 'edwin-sifuna', email: 'edwin@edwinsifuna.com' }];

export async function seedDemoLogins(db: AnyDb) {
	const password = process.env.ADMIN_PASSWORD;
	if (!password) {
		console.log('[demo-logins] ADMIN_PASSWORD not set, skipping');
		return;
	}

	for (const { slug, email } of DEMO_LOGINS) {
		const [subject] = await db.select({ id: users.id, authUserId: users.authUserId }).from(users).where(eq(users.slug, slug));
		if (!subject) {
			console.log(`[demo-logins] ${slug} not seeded yet, skipping`);
			continue;
		}
		if (!subject.authUserId) {
			console.log(`[demo-logins] ${slug} has no linked auth user, skipping`);
			continue;
		}

		const [emailTaken] = await db.select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.email, email));
		if (emailTaken && emailTaken.id !== subject.authUserId) {
			console.log(`[demo-logins] ${email} is already used by a different account, skipping ${slug}`);
			continue;
		}

		await db.update(authUsers).set({ email, emailVerified: true }).where(eq(authUsers.id, subject.authUserId));
		await db.update(users).set({ verified: { email: true, sms: false, whatsapp: false } }).where(eq(users.id, subject.id));

		// Normal onboarding always gives a leader a self-manager row (onboarding.md:
		// "the creator is the campaign's first manager, with admin permissions") — the
		// account switcher (getSwitcherProfiles) reads ONLY the managers table to build
		// its list, not the leader-owns-account case getLeaderContext also handles, so
		// a profile seeded outside onboarding (no managers row at all) resolves fine by
		// direct URL but never shows up in the switcher once it has a real login. Backfill
		// it here since this is exactly the moment that gap starts to matter.
		const [selfManager] = await db
			.select({ id: managers.id })
			.from(managers)
			.where(and(eq(managers.userId, subject.id), eq(managers.subjectUserId, subject.id), isNull(managers.deletedAt)));
		if (!selfManager) {
			await db.insert(managers).values({ userId: subject.id, subjectUserId: subject.id, roles: { admin: true }, isActive: true });
		}

		const hashed = await hashPassword(password);
		const [existingCredential] = await db.select({ id: account.id }).from(account).where(eq(account.userId, subject.authUserId));
		if (existingCredential) {
			await db.update(account).set({ password: hashed }).where(eq(account.id, existingCredential.id));
		} else {
			await db.insert(account).values({ id: randomUUID(), accountId: subject.authUserId, providerId: 'credential', userId: subject.authUserId, password: hashed });
		}

		console.log(`[demo-logins] ${slug} can now log in as ${email}`);
	}
}
