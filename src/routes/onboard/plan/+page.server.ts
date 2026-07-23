import { redirect } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { requireDashboardUser } from '$lib/server/dashboard';
import { listCurrentPricing } from '$lib/server/packages';
import { fullName } from '$lib/server/leader';
import type { PageServerLoad } from './$types';

// Step 4 of the onboarding wizard: pick one of the three packages. No profile exists
// yet at this point (create/link happens at checkout, after payment) — this just
// needs a name to show and the live rate card. Everything from step 3 rides forward
// via query params (read by +page.svelte to build the checkout link) rather than
// round-tripping through the database.
//
// Pricing is moving to one flat set of 3 plans for every office — no seat is
// declared at onboarding anymore to derive a band from, so this defaults to the
// 'ward' (MCA) band's rates for now until that flat pricing table replaces bands entirely.
export const load: PageServerLoad = async (event) => {
	await requireDashboardUser(event);
	const sp = event.url.searchParams;
	const linkSubjectId = Number(sp.get('linkSubjectId') ?? 0) || null;

	let subjectName: string;
	if (linkSubjectId) {
		const [subject] = await db
			.select({ firstName: users.firstName, otherNames: users.otherNames })
			.from(users)
			.where(and(eq(users.id, linkSubjectId), isNull(users.deletedAt)));
		if (!subject) redirect(302, '/onboard/profile');
		subjectName = fullName(subject);
	} else {
		const firstName = sp.get('firstName');
		const otherNames = sp.get('otherNames');
		if (!firstName || !otherNames) redirect(302, '/onboard/profile');
		subjectName = `${firstName} ${otherNames}`;
	}

	// The live rate card, indexed [band][tier][cycle] for the client to price cards.
	const pricing = await listCurrentPricing();
	const rates: Record<string, Record<string, Record<string, number>>> = {};
	for (const r of pricing) {
		(rates[r.band] ??= {})[r.tier] ??= {};
		rates[r.band][r.tier][r.billingCycle] = r.amount;
	}

	return { subjectName, rates };
};
