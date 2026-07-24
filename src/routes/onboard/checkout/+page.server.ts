import { error, fail } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { managers, payments, pricing, subscriptions, users } from '$lib/server/db/schema';
import { requireDashboardUser } from '$lib/server/dashboard';
import { redirectWithFlash } from '$lib/server/flash';
import { BILLING_CYCLES, SUBSCRIPTION_TIERS } from '$lib/server/packages';
import { assertClaimable, createProfile, linkProfile, notifyAdminsOfNewProfile, notifyPayerOfPayment, validateOnboardInput } from '$lib/server/onboard';
import { fullName } from '$lib/server/leader';
import type { Actions, PageServerLoad } from './$types';

// Resolves + authorizes the checkout selection (plan + the onboard step 3 fields
// carried in via query params), and reads the live rate for it. Shared by the load
// (reads the URL's query) and the Pay action (reads the same query string re-posted
// as a single hidden field — action="?/pay" REPLACES the whole query string per
// URL-resolution rules, so reading event.url there directly would find nothing).
async function resolveSelection(sp: URLSearchParams) {
	const tier = String(sp.get('tier') ?? '');
	const cycle = String(sp.get('cycle') ?? '');
	if (!(SUBSCRIPTION_TIERS as readonly string[]).includes(tier) || !(BILLING_CYCLES as readonly string[]).includes(cycle)) {
		error(400, 'Invalid plan selection.');
	}

	const linkSubjectId = Number(sp.get('linkSubjectId') ?? 0) || null;
	const raw = {
		firstName: sp.get('firstName') ?? '',
		otherNames: sp.get('otherNames') ?? '',
		myRole: sp.get('myRole') ?? ''
	};
	const validated = validateOnboardInput(raw);
	if (!validated.ok) error(400, validated.error);

	let subjectName: string;
	if (linkSubjectId) {
		// Re-check the link target is still claimable — it may have been taken by
		// someone else since step 3 (the authoritative check is linkProfile's own
		// race guard at Pay time; this one is just for a clean error here).
		const claimable = await assertClaimable(linkSubjectId);
		if (!claimable.ok) error(400, claimable.error);
		const [subject] = await db.select({ firstName: users.firstName, otherNames: users.otherNames }).from(users).where(eq(users.id, linkSubjectId));
		if (!subject) error(404, 'Profile not found.');
		subjectName = fullName(subject);
	} else {
		subjectName = `${validated.input.firstName} ${validated.input.otherNames}`;
	}

	const [rate] = await db
		.select({ amount: pricing.amount })
		.from(pricing)
		.where(and(eq(pricing.tier, tier as 'kickstart'), eq(pricing.billingCycle, cycle as 'monthly'), isNull(pricing.activeTo)));
	if (!rate) error(400, 'No price is set for that plan yet.');

	return { tier, cycle, amount: rate.amount, input: validated.input, linkSubjectId, subjectName };
}

export const load: PageServerLoad = async (event) => {
	await requireDashboardUser(event);
	const sel = await resolveSelection(event.url.searchParams);
	return { tier: sel.tier, cycle: sel.cycle, amount: sel.amount, subjectName: sel.subjectName, passthrough: event.url.search.slice(1) };
};

export const actions: Actions = {
	// Mock charge: creates/links the profile (slug minted here, not before — an
	// abandoned wizard never leaves a phantom profile behind), then records an
	// active subscription + a successful payment. Real Paystack (initialize +
	// webhook verify) replaces the charge itself later.
	pay: async (event) => {
		const { domainUser } = await requireDashboardUser(event);
		const form = await event.request.formData();
		const sp = new URLSearchParams(String(form.get('passthrough') ?? ''));
		const sel = await resolveSelection(sp);

		// A claim target's existing subscription blocks a duplicate; a fresh create
		// can't collide (the profile doesn't exist until the next line).
		if (sel.linkSubjectId) {
			const [live] = await db
				.select({ id: subscriptions.id })
				.from(subscriptions)
				.where(and(eq(subscriptions.subjectUserId, sel.linkSubjectId), inArray(subscriptions.status, ['active', 'pending'])));
			if (live) {
				const [existing] = await db.select({ userId: managers.userId }).from(managers).where(and(eq(managers.subjectUserId, sel.linkSubjectId), eq(managers.isActive, true), isNull(managers.deletedAt)));
				redirectWithFlash(event.cookies, existing?.userId === domainUser.id ? `/dashboard/account` : '/onboard/profile', 'This profile already has an active subscription.');
			}
		}

		let result: { slug: string; subjectUserId: number };
		try {
			result = sel.linkSubjectId ? await linkProfile(domainUser.id, sel.input, sel.linkSubjectId) : await createProfile(domainUser.id, sel.input);
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Could not create the profile.' });
		}

		const now = new Date();
		const endsAt = new Date(now);
		if (sel.cycle === 'annual') endsAt.setFullYear(endsAt.getFullYear() + 1);
		else endsAt.setMonth(endsAt.getMonth() + 1);
		const reference = `mock-${randomUUID()}`;

		const [subscription] = await db
			.insert(subscriptions)
			.values({
				subjectUserId: result.subjectUserId,
				payerId: domainUser.id,
				tier: sel.tier as 'kickstart',
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

		// Admins get the same notification whether this was a brand-new profile or a
		// claim on a seeded one — checkout is the only place that has the plan/price
		// alongside the create/link result, so it fires here rather than in onboard.ts.
		await notifyAdminsOfNewProfile({
			kind: sel.linkSubjectId ? 'claimed' : 'created',
			actorUserId: domainUser.id,
			subjectUserId: result.subjectUserId,
			slug: result.slug,
			tier: sel.tier,
			cycle: sel.cycle,
			amount: sel.amount,
			subscriptionEndsAt: endsAt
		});
		await notifyPayerOfPayment({
			payerUserId: domainUser.id,
			subjectUserId: result.subjectUserId,
			slug: result.slug,
			tier: sel.tier,
			cycle: sel.cycle,
			amount: sel.amount,
			subscriptionEndsAt: endsAt
		});

		// Straight to the leader's own dashboard once paid — no /dashboard/account detour.
		redirectWithFlash(event.cookies, `/dashboard/${result.slug}/profile`, "Your payment was successful! Welcome to your leader's dashboard.");
	}
};
