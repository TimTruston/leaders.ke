// Admin "Packages" tab: the subscription rate card (pricing table) and each
// package's caps (packages table). Rates are versioned, not mutated in place, so
// changing one supersedes the current row (sets its activeTo) and inserts a fresh
// one — history stays intact for audit. Caps are edited in place.
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { packages, pricing, type PackageFeatures } from '$lib/server/db/schema';

export type PricingRow = {
	id: number;
	band: string;
	tier: string;
	billingCycle: string;
	amount: number;
	activeFrom: string;
};

export const PRICE_BANDS = ['national', 'regional', 'ward'] as const;
export const SUBSCRIPTION_TIERS = ['aspirant', 'influencer', 'mobilizer'] as const;
export const BILLING_CYCLES = ['monthly', 'annual'] as const;

type PriceBand = (typeof PRICE_BANDS)[number];
type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];
type BillingCycle = (typeof BILLING_CYCLES)[number];

/** Every currently-active rate (activeTo is null), one per (band, tier, cycle). */
export async function listCurrentPricing(): Promise<PricingRow[]> {
	const rows = await db.select().from(pricing).where(isNull(pricing.activeTo));
	return rows.map((r) => ({
		id: r.id,
		band: r.band,
		tier: r.tier,
		billingCycle: r.billingCycle,
		amount: r.amount,
		activeFrom: r.activeFrom.toISOString()
	}));
}

export async function setRate(band: PriceBand, tier: SubscriptionTier, billingCycle: BillingCycle, amount: number) {
	const now = new Date();
	await db
		.update(pricing)
		.set({ activeTo: now })
		.where(and(eq(pricing.band, band), eq(pricing.tier, tier), eq(pricing.billingCycle, billingCycle), isNull(pricing.activeTo)));
	await db.insert(pricing).values({ band, tier, billingCycle, amount, activeFrom: now });
}

export const PACKAGE_FEATURE_KEYS = ['pages', 'managers', 'ambassadors', 'subscriptions', 'storageMb', 'eventsPerWeek'] as const;
export type PackageFeatureKey = (typeof PACKAGE_FEATURE_KEYS)[number];

export type PackageRow = { band: string; tier: string; features: PackageFeatures };

/** Every package's caps, one row per (band, tier) — seeded from packages.json. */
export async function listPackages(): Promise<PackageRow[]> {
	const rows = await db.select().from(packages);
	return rows.map((r) => ({ band: r.band, tier: r.tier, features: r.features }));
}

/** Updates one cap on one package; null = unlimited. */
export async function setPackageFeature(
	band: PriceBand,
	tier: SubscriptionTier,
	key: PackageFeatureKey,
	value: number | null
) {
	const [row] = await db
		.select({ id: packages.id, features: packages.features })
		.from(packages)
		.where(and(eq(packages.band, band), eq(packages.tier, tier)));
	if (!row) return { ok: false as const, error: 'Package not found — run the packages seed first.' };

	await db
		.update(packages)
		.set({ features: { ...row.features, [key]: value }, updatedAt: new Date() })
		.where(eq(packages.id, row.id));
	return { ok: true as const };
}
