// One-time passcodes for verifying a contact channel, backed by the `otps` table.
import { randomInt, randomBytes, createHash } from 'node:crypto';
import { and, desc, eq, gt, gte, isNull, count } from 'drizzle-orm';
import { env as publicEnv } from '$env/dynamic/public';
import { db } from '$lib/server/db';
import { otps, passwordResetRequests, type otpChannelEnum } from '$lib/server/db/schema';
import { sendSms } from '$lib/server/sms';
import { sendEmail } from '$lib/server/email';
import { getPlatformSettings } from '$lib/server/settings';

const OTP_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const DAY_MS = 24 * 60 * 60_000;

type OtpChannel = (typeof otpChannelEnum.enumValues)[number];

function hashCode(code: string) {
	return createHash('sha256').update(code).digest('hex');
}

function generateCode() {
	return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Seconds remaining before another code may be sent to this destination, or 0 if
 * allowed now. Keyed on destination (not userId): the cooldown must hold even
 * across two different signup attempts targeting the same phone number.
 */
export async function otpCooldownRemaining(channel: OtpChannel, destination: string): Promise<number> {
	const [latest, settings] = await Promise.all([
		db
			.select({ createdAt: otps.createdAt })
			.from(otps)
			.where(and(eq(otps.channel, channel), eq(otps.destination, destination)))
			.orderBy(desc(otps.createdAt))
			.limit(1)
			.then((rows) => rows[0]),
		getPlatformSettings()
	]);
	if (!latest) return 0;
	const cooldownMs = settings.otpCooldownSeconds * 1000;
	const elapsed = Date.now() - latest.createdAt.getTime();
	return elapsed >= cooldownMs ? 0 : Math.ceil((cooldownMs - elapsed) / 1000);
}

/**
 * Seconds remaining before this user may request another code on this channel,
 * regardless of destination — keyed on userId (unlike otpCooldownRemaining, which
 * is keyed on destination) so someone can't dodge the per-destination cooldown by
 * simply typing a different address/number on every request
 * e.g. changing email and spamming arbitrary inboxes with confirmation emails.
 */
export async function otpCooldownRemainingForUser(userId: number, channel: OtpChannel): Promise<number> {
	const [latest, settings] = await Promise.all([
		db
			.select({ createdAt: otps.createdAt })
			.from(otps)
			.where(and(eq(otps.userId, userId), eq(otps.channel, channel)))
			.orderBy(desc(otps.createdAt))
			.limit(1)
			.then((rows) => rows[0]),
		getPlatformSettings()
	]);
	if (!latest) return 0;
	const cooldownMs = settings.otpCooldownSeconds * 1000;
	const elapsed = Date.now() - latest.createdAt.getTime();
	return elapsed >= cooldownMs ? 0 : Math.ceil((cooldownMs - elapsed) / 1000);
}

/** Issues a fresh code (and, for email, a click-through link); throws if within the resend cooldown or the 24h send cap. */
export async function sendOtp(userId: number, channel: OtpChannel, destination: string, name?: string, linkPath: string = '/verify/email') {
	const remaining = Math.max(await otpCooldownRemaining(channel, destination), await otpCooldownRemainingForUser(userId, channel));
	if (remaining > 0) throw new Error(`Wait ${remaining}s before requesting another code.`);

	const [[{ sentToday }], settings] = await Promise.all([
		db
			.select({ sentToday: count() })
			.from(otps)
			.where(and(eq(otps.channel, channel), eq(otps.destination, destination), gte(otps.createdAt, new Date(Date.now() - DAY_MS)))),
		getPlatformSettings()
	]);
	if (sentToday >= settings.otpDailyCap) {
		throw new Error('Too many codes requested for this destination today. Try again tomorrow.');
	}

	const code = generateCode();
	const linkToken = channel === 'email' ? randomBytes(16).toString('hex') : null; // 32 hex chars

	await db.insert(otps).values({
		userId,
		channel,
		destination,
		codeHash: hashCode(code),
		linkToken,
		expiresAt: new Date(Date.now() + OTP_TTL_MS)
	});

	// Logged regardless of channel so codes are visible during testing even once a
	// real gateway is wired up (sendSms itself also stubs to console without an API key).
	console.log(`[otp] ${channel} code for user ${userId} (${destination}): ${code}`);
	if (channel === 'sms' || channel === 'whatsapp') {
		await sendSms(destination, `Your leaders.ke verification code is ${code}. It expires in 10 minutes.`);
	} else if (channel === 'email') {
		const link = `${publicEnv.PUBLIC_BASE_URL}${linkPath}?linkToken=${linkToken}`;
		await sendEmail({
			to: destination,
			subject: 'Your leaders.ke verification',
			text: `Hi ${name || 'there'},\n\nVerify your email using the code ${code} or by clicking the link below:\n${link}\n\nThey expire in 10 minutes.\nDidn't sign up? Ignore this email.`
		});
	}
}

/** True if a still-valid (unconsumed, unexpired) code was already sent to this
 * destination — lets the verify pages auto-send only when none is outstanding, so
 * a refresh doesn't fire a duplicate. */
export async function hasPendingOtp(channel: OtpChannel, destination: string): Promise<boolean> {
	const [row] = await db
		.select({ id: otps.id })
		.from(otps)
		.where(and(eq(otps.channel, channel), eq(otps.destination, destination), isNull(otps.consumedAt), gt(otps.expiresAt, new Date())))
		.limit(1);
	return !!row;
}

/** Verifies the latest unconsumed code for this user/channel. */
export async function verifyOtp(userId: number, channel: OtpChannel, code: string): Promise<boolean> {
	return (await verifyOtpWithDestination(userId, channel, code)).ok;
}

/** Same as verifyOtp, but also returns the destination the code was sent to
 * e.g. to learn the new email being confirmed after changing. */
export async function verifyOtpWithDestination(
	userId: number,
	channel: OtpChannel,
	code: string
): Promise<{ ok: boolean; destination?: string }> {
	const [latest] = await db
		.select()
		.from(otps)
		.where(and(eq(otps.userId, userId), eq(otps.channel, channel), isNull(otps.consumedAt), gt(otps.expiresAt, new Date())))
		.orderBy(desc(otps.createdAt))
		.limit(1);
	if (!latest || latest.attempts >= MAX_ATTEMPTS) return { ok: false };

	const ok = latest.codeHash === hashCode(code);
	await db
		.update(otps)
		.set(ok ? { consumedAt: new Date() } : { attempts: latest.attempts + 1 })
		.where(eq(otps.id, latest.id));
	return ok ? { ok, destination: latest.destination } : { ok };
}

/**
 * Records a password-reset request for this email, enforcing the same
 * cooldown/daily-cap settings as OTP sends — otherwise call this right before
 * auth.api.requestPasswordReset. Throws (with the standard "wait Xs"/"too many"
 * messages) if the limit is hit; on success the email is safe to send.
 */
export async function checkPasswordResetRateLimit(destination: string): Promise<void> {
	const settings = await getPlatformSettings();

	const [latest] = await db
		.select({ createdAt: passwordResetRequests.createdAt })
		.from(passwordResetRequests)
		.where(eq(passwordResetRequests.destination, destination))
		.orderBy(desc(passwordResetRequests.createdAt))
		.limit(1);
	if (latest) {
		const cooldownMs = settings.otpCooldownSeconds * 1000;
		const elapsed = Date.now() - latest.createdAt.getTime();
		if (elapsed < cooldownMs) throw new Error(`Wait ${Math.ceil((cooldownMs - elapsed) / 1000)}s before requesting another reset email.`);
	}

	const [{ sentToday }] = await db
		.select({ sentToday: count() })
		.from(passwordResetRequests)
		.where(and(eq(passwordResetRequests.destination, destination), gte(passwordResetRequests.createdAt, new Date(Date.now() - DAY_MS))));
	if (sentToday >= settings.otpDailyCap) {
		throw new Error('Too many reset emails requested for this address today. Try again tomorrow.');
	}

	await db.insert(passwordResetRequests).values({ destination });
}

/** Verifies (and consumes) an email OTP row by its click-through link token. */
export async function verifyOtpLinkToken(linkToken: string): Promise<{ userId: number; destination: string } | null> {
	const [latest] = await db
		.select()
		.from(otps)
		.where(and(eq(otps.channel, 'email'), eq(otps.linkToken, linkToken), isNull(otps.consumedAt), gt(otps.expiresAt, new Date())))
		.limit(1);
	if (!latest || !latest.userId) return null;

	await db.update(otps).set({ consumedAt: new Date() }).where(eq(otps.id, latest.id));
	return { userId: latest.userId, destination: latest.destination };
}
