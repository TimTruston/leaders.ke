import { error, fail } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { managers, payments, pricing, subscriptions, users } from '$lib/server/db/schema';
import { requireDashboardUser } from '$lib/server/dashboard';
import { fullName } from '$lib/server/leader';
import { redirectWithFlash } from '$lib/server/flash';
import { BILLING_CYCLES, PRICE_BANDS, SUBSCRIPTION_TIERS } from '$lib/server/packages';
import type { Actions, PageServerLoad } from './$types';

const BAND_LABELS: Record<string, string> = { ward: 'MCA', regional: 'Governor / Senator / MP / Woman Rep', national: 'President & Vice President' };

// Resolves + authorizes the checkout selection, and reads the live rate for it. Shared
// by the load (reads the URL's query) and the pay action (reads posted hidden fields —
// action="?/pay" REPLACES the whole query string per URL-resolution rules, so subject/
// tier/band/cycle would vanish from the POST's URL if read from event.url there instead).
async function resolveSelection(params: { subject: string | null; tier: string | null; band: string | null; cycle: string | null }, domainUserId: number) {
	const subjectId = Number(params.subject ?? 0);
	const tier = String(params.tier ?? '');
	const band = String(params.band ?? '');
	const cycle = String(params.cycle ?? '');

	if (!subjectId || !(SUBSCRIPTION_TIERS as readonly string[]).includes(tier) || !(PRICE_BANDS as readonly string[]).includes(band) || !(BILLING_CYCLES as readonly string[]).includes(cycle)) {
		error(400, 'Invalid plan selection.');
	}

	const [managed] = await db
		.select({ id: managers.id })
		.from(managers)
		.where(and(eq(managers.userId, domainUserId), eq(managers.subjectUserId, subjectId), eq(managers.isActive, true), isNull(managers.deletedAt)));
	if (!managed) error(403, 'You do not manage this profile.');

	const [subject] = await db.select({ firstName: users.firstName, otherNames: users.otherNames }).from(users).where(eq(users.id, subjectId));
	if (!subject) error(404, 'Profile not found.');

	const [rate] = await db
		.select({ amount: pricing.amount })
		.from(pricing)
		.where(and(eq(pricing.band, band as 'ward'), eq(pricing.tier, tier as 'aspirant'), eq(pricing.billingCycle, cycle as 'monthly'), isNull(pricing.activeTo)));
	if (!rate) error(400, 'No price is set for that plan yet.');

	return { subjectId, tier, band, cycle, amount: rate.amount, subjectName: fullName(subject) };
}

export const load: PageServerLoad = async (event) => {
	const { domainUser } = await requireDashboardUser(event);
	const sp = event.url.searchParams;
	const sel = await resolveSelection({ subject: sp.get('subject'), tier: sp.get('tier'), band: sp.get('band'), cycle: sp.get('cycle') }, domainUser.id);
	return { ...sel, bandLabel: BAND_LABELS[sel.band] ?? sel.band };
};

export const actions: Actions = {
	// Mock charge: records an active subscription + a successful payment and moves on.
	// Real Paystack (initialize + webhook verify) replaces the body of this action later.
	pay: async (event) => {
		const { domainUser } = await requireDashboardUser(event);
		const form = await event.request.formData();
		const sel = await resolveSelection({ subject: form.get('subject') as string | null, tier: form.get('tier') as string | null, band: form.get('band') as string | null, cycle: form.get('cycle') as string | null }, domainUser.id);

		// One live subscription per person (DB-enforced) — if they already have one,
		// treat checkout as already done rather than 500 on the unique index.
		const [live] = await db
			.select({ id: subscriptions.id })
			.from(subscriptions)
			.where(and(eq(subscriptions.subjectUserId, sel.subjectId), inArray(subscriptions.status, ['active', 'pending'])));
		if (live) redirectWithFlash(event.cookies, '/dashboard/account', 'This profile already has an active subscription.');

		const now = new Date();
		const endsAt = new Date(now);
		if (sel.cycle === 'annual') endsAt.setFullYear(endsAt.getFullYear() + 1);
		else endsAt.setMonth(endsAt.getMonth() + 1);
		const reference = `mock-${randomUUID()}`;

		const [subscription] = await db
			.insert(subscriptions)
			.values({
				subjectUserId: sel.subjectId,
				payerId: domainUser.id,
				tier: sel.tier as 'aspirant',
				billingCycle: sel.cycle as 'monthly',
				amount: sel.amount,
				status: 'active',
				origin: 'new',
				startAt: now,
				endsAt,
				paidAt: now,
				paymentMethod: 'mock',
				paymentReference: reference
			})
			.returning();

		await db.insert(payments).values({
			payerId: domainUser.id,
			purpose: 'subscription',
			subscriptionId: subscription.id,
			amount: sel.amount,
			status: 'success',
			method: 'mock',
			providerReference: reference,
			metadata: { mock: true },
			paidAt: now
		});

		redirectWithFlash(event.cookies, '/dashboard/account', 'Your payment was successful! Confirm your contacts below to help us reach you easily.');
	}
};
