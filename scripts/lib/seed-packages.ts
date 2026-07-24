// Seeds the package matrix from src/lib/data/packages.json: current rates into
// `pricing` (versioned — only supersedes when the amount actually differs) and
// per-tier caps into `packages` (insert-only; existing rows keep any admin edits).
// pricing-v2: one flat rate per tier, no seat band. Idempotent, safe to re-run.
import { and, eq, isNull } from 'drizzle-orm';
import { packages, pricing, type PackageFeatures } from '../../src/lib/server/db/schema';
import packageData from '../../src/lib/data/packages.json';
import type { AnyDb } from './names';

type SeedPackage = PackageFeatures & { monthly: number; annual: number };
const TIERS = ['kickstart', 'mobilize', 'dominate'] as const;

export async function seedPackages(db: AnyDb) {
	let ratesWritten = 0;
	let featuresWritten = 0;

	for (const tier of TIERS) {
		const seed = (packageData as Record<string, SeedPackage>)[tier];
		const { monthly, annual, ...features } = seed;

		for (const [billingCycle, amount] of [['monthly', monthly], ['annual', annual]] as const) {
			const [current] = await db
				.select({ id: pricing.id, amount: pricing.amount })
				.from(pricing)
				.where(and(eq(pricing.tier, tier), eq(pricing.billingCycle, billingCycle), isNull(pricing.activeTo)));
			if (current?.amount === amount) continue;
			if (current) await db.update(pricing).set({ activeTo: new Date() }).where(eq(pricing.id, current.id));
			await db.insert(pricing).values({ tier, billingCycle, amount });
			ratesWritten++;
		}

		const [existing] = await db.select({ id: packages.id }).from(packages).where(eq(packages.tier, tier));
		if (!existing) {
			await db.insert(packages).values({ tier, features });
			featuresWritten++;
		}
	}

	console.log(`[packages] ${ratesWritten} rate(s) written, ${featuresWritten} feature row(s) created`);
}
