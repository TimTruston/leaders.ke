import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { platformSettings } from '$lib/server/db/schema';
import { requireAdmin } from '$lib/server/dashboard';
import { getPlatformSettings } from '$lib/server/settings';
import {
	BILLING_CYCLES,
	listCurrentPricing,
	listPackages,
	PACKAGE_FEATURE_KEYS,
	PRICE_BANDS,
	setPackageFeature,
	setRate,
	SUBSCRIPTION_TIERS,
	type PackageFeatureKey
} from '$lib/server/packages';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	await requireAdmin(event);
	return {
		pricing: await listCurrentPricing(),
		packages: await listPackages(),
		// Lifetime invite caps are part of what each package buys, so they're
		// managed here on the package matrix, not under Settings.
		inviteLimits: (await getPlatformSettings()).inviteLimits
	};
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
	},

	// One cap on one package; an emptied input means unlimited (null).
	setFeature: async (event) => {
		await requireAdmin(event);
		const form = await event.request.formData();
		const band = String(form.get('band') ?? '');
		const tier = String(form.get('tier') ?? '');
		const key = String(form.get('key') ?? '');
		const raw = String(form.get('value') ?? '').trim();

		if (
			!PRICE_BANDS.includes(band as (typeof PRICE_BANDS)[number]) ||
			!SUBSCRIPTION_TIERS.includes(tier as (typeof SUBSCRIPTION_TIERS)[number]) ||
			!PACKAGE_FEATURE_KEYS.includes(key as PackageFeatureKey)
		) {
			return fail(400, { error: 'Invalid band, tier, or feature.' });
		}
		const value = raw === '' ? null : Number(raw);
		if (value !== null && (!Number.isInteger(value) || value < 0)) {
			return fail(400, { error: 'Enter a whole number, or clear the field for unlimited.' });
		}

		const result = await setPackageFeature(
			band as (typeof PRICE_BANDS)[number],
			tier as (typeof SUBSCRIPTION_TIERS)[number],
			key as PackageFeatureKey,
			value
		);
		if (!result.ok) return fail(400, { error: result.error });
		return { updated: true };
	},

	saveInviteLimits: async (event) => {
		await requireAdmin(event);
		const form = await event.request.formData();
		const aspirant = Number(form.get('aspirant'));
		const influencer = Number(form.get('influencer'));
		const mobilizer = Number(form.get('mobilizer'));

		for (const [label, value] of [
			['Aspirant limit', aspirant],
			['Influencer limit', influencer],
			['Mobilizer limit', mobilizer]
		] as const) {
			if (!Number.isInteger(value) || value < 1) return fail(400, { error: `${label} must be a whole number of at least 1.` });
		}

		await db
			.update(platformSettings)
			.set({ inviteLimits: { aspirant, influencer, mobilizer }, updatedAt: new Date() })
			.where(eq(platformSettings.id, 1));
		return { updated: true };
	}
};
