import { error, redirect } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { managers, users } from '$lib/server/db/schema';
import { requireDashboardUser } from '$lib/server/dashboard';
import { listCurrentPricing } from '$lib/server/packages';
import { fullName } from '$lib/server/leader';
import type { PageServerLoad } from './$types';

// Step 4 of the onboarding wizard: pick one of the three packages for the profile
// created/linked in step 3. Choosing a plan carries the selection to /onboard/checkout.
export const load: PageServerLoad = async (event) => {
	const { domainUser } = await requireDashboardUser(event);
	const subjectId = Number(event.url.searchParams.get('subject') ?? 0);
	if (!subjectId) redirect(302, '/onboard/profile');

	// The viewer must manage the profile they're buying for (created it in step 3).
	const [managed] = await db
		.select({ id: managers.id })
		.from(managers)
		.where(and(eq(managers.userId, domainUser.id), eq(managers.subjectUserId, subjectId), eq(managers.isActive, true), isNull(managers.deletedAt)));
	if (!managed) error(403, 'You do not manage this profile.');

	const [subject] = await db.select({ firstName: users.firstName, otherNames: users.otherNames }).from(users).where(eq(users.id, subjectId));
	if (!subject) error(404, 'Profile not found.');

	// The live rate card, indexed [band][tier][cycle] for the client to price cards.
	const pricing = await listCurrentPricing();
	const rates: Record<string, Record<string, Record<string, number>>> = {};
	for (const r of pricing) {
		(rates[r.band] ??= {})[r.tier] ??= {};
		rates[r.band][r.tier][r.billingCycle] = r.amount;
	}

	return { subjectId, subjectName: fullName(subject), rates };
};
