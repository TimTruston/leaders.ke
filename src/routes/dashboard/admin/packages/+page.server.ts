import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/dashboard';
import { BILLING_CYCLES, listCurrentPricing, PRICE_BANDS, setRate, SUBSCRIPTION_TIERS } from '$lib/server/packages';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	await requireAdmin(event);
	return { pricing: await listCurrentPricing() };
};

export const actions: Actions = {
	setRate: async (event) => {
		await requireAdmin(event);
		const form = await event.request.formData();
		const band = String(form.get('band') ?? '');
		const tier = String(form.get('tier') ?? '');
		const billingCycle = String(form.get('billingCycle') ?? '');
		const amount = Number(form.get('amount') ?? 0);

		if (
			!PRICE_BANDS.includes(band as (typeof PRICE_BANDS)[number]) ||
			!SUBSCRIPTION_TIERS.includes(tier as (typeof SUBSCRIPTION_TIERS)[number]) ||
			!BILLING_CYCLES.includes(billingCycle as (typeof BILLING_CYCLES)[number])
		) {
			return fail(400, { error: 'Invalid band, tier, or billing cycle.' });
		}
		if (!Number.isFinite(amount) || amount <= 0) return fail(400, { error: 'Enter a valid amount in KES.' });

		await setRate(
			band as (typeof PRICE_BANDS)[number],
			tier as (typeof SUBSCRIPTION_TIERS)[number],
			billingCycle as (typeof BILLING_CYCLES)[number],
			amount
		);
		return { updated: true };
	}
};
