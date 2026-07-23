import { redirect } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { requireDashboardUser } from '$lib/server/dashboard';
import { listCurrentPricing } from '$lib/server/packages';
import { fullName } from '$lib/server/leader';
import { getSeatInfo, leadPositionId } from '$lib/server/onboard';
import type { PageServerLoad } from './$types';

// Step 4 of the onboarding wizard: pick one of the three packages. No profile exists
// yet at this point (create/link happens at checkout, after payment) — this just
// needs a name to show and the live rate card. Everything from step 3 rides forward
// via query params (read by +page.svelte to build the checkout link) rather than
// round-tripping through the database.
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

	// The office pricing is based on: Profile already named the exact seat, so this
	// page states it plainly rather than asking again via a vague band toggle.
	const positionId = leadPositionId({
		aspirantPositionId: Number(sp.get('aspirantPositionId') ?? 0) || null,
		currentPositionId: Number(sp.get('currentPositionId') ?? 0) || null,
		formerPositionId: Number(sp.get('formerPositionId') ?? 0) || null
	});
	const seat = positionId ? (await getSeatInfo([positionId])).get(positionId) : null;

	return { subjectName, rates, defaultBand: seat?.band ?? null, seatLabel: seat?.label ?? null };
};
