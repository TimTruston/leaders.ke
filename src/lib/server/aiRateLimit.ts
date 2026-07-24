// Anti-abuse cap on the public AI Chat "ask" action (see [leader]/+page.server.ts
// and [leader]/[year]/+page.server.ts) — without this, a scripted burst of
// questions racks up real Anthropic API cost fast (Opus-class pricing, no per-user
// credit ledger exists yet to meter it). Flat cap for every caller, paid tier or
// not — there's no credits ledger to gate this on (see packages.features.
// creditsPerMonth, a display cap only, never actually tracked/consumed anywhere).
// Global across every leader's chat, not per-profile: the cost risk is aggregate
// API spend, not any one leader's usage.
import { randomBytes } from 'node:crypto';
import { and, count, eq, gte } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { aiAskEvents } from '$lib/server/db/schema';

const DAILY_LIMIT = 5;
const ANON_ID_COOKIE = 'anon_id'; // shared with /vote/2027's device cookie — one id per visitor across features

function startOfToday(): Date {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	return d;
}

function anonDeviceId(): string {
	return randomBytes(16).toString('hex'); // matches /vote/2027's anonDeviceId — 32 hex chars
}

/** Blocks once this visitor's session (anon_id cookie) OR IP has already asked
 * DAILY_LIMIT questions today — whichever hits first. Mints the anon_id cookie if
 * missing (same one /vote/2027 sets) so the cap actually persists across requests.
 * Records this attempt on success so the caller doesn't need a separate write. */
export async function enforceAskRateLimit(event: RequestEvent): Promise<{ ok: true } | { ok: false; error: string }> {
	let anonId = event.cookies.get(ANON_ID_COOKIE) ?? null;
	if (!anonId) {
		anonId = anonDeviceId();
		event.cookies.set(ANON_ID_COOKIE, anonId, { path: '/', httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
	}

	let ip: string | null = null;
	try {
		ip = event.getClientAddress();
	} catch {
		ip = null;
	}

	// Each dimension checked independently — session and IP caps are separate, so
	// rotating either one alone doesn't help an abuser get past the other.
	const since = startOfToday();
	const [[{ n: byAnon }], [{ n: byIp }]] = await Promise.all([
		db.select({ n: count() }).from(aiAskEvents).where(and(gte(aiAskEvents.createdAt, since), eq(aiAskEvents.anonId, anonId))),
		ip
			? db.select({ n: count() }).from(aiAskEvents).where(and(gte(aiAskEvents.createdAt, since), eq(aiAskEvents.ipAddress, ip)))
			: Promise.resolve([{ n: 0 }])
	]);

	if (byAnon >= DAILY_LIMIT) {
		return { ok: false, error: "You've asked the maximum of 5 questions for today. Try again tomorrow." };
	}
	if (byIp >= DAILY_LIMIT) {
		return { ok: false, error: 'Too many questions from this network today. Try again tomorrow.' };
	}

	await db.insert(aiAskEvents).values({ anonId, ipAddress: ip });
	return { ok: true };
}
