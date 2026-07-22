import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { parties, positions, users } from '$lib/server/db/schema';
import { requireDashboardUser } from '$lib/server/dashboard';
import { fullName } from '$lib/server/leader';
import { createOnboardProfile, linkOnboardProfile, ONBOARD_STATUS_LABELS, type OnboardStatus } from '$lib/server/onboard';
import { CAMPAIGN_ROLES, isValidNationalId } from '$lib/utils/campaignRoles';
import type { Actions, PageServerLoad } from './$types';

// Step 3 of the onboarding wizard: describe the leader, match against seeded profiles,
// then create or link one. Submit lands on /onboard/plan (step 4).
export const load: PageServerLoad = async (event) => {
	const { domainUser } = await requireDashboardUser(event);

	// "Claim this profile" on a public page arrives here as ?profile=<slug> — prefill
	// the name from THAT profile (not the citizen's own) and hand the client its id so
	// the Matching Profiles panel can auto-select it once the (debounced) match lands.
	const claimSlug = event.url.searchParams.get('profile');
	const [claimTarget] = claimSlug
		? await db.select({ id: users.id, firstName: users.firstName, otherNames: users.otherNames }).from(users).where(and(eq(users.slug, claimSlug), isNull(users.deletedAt)))
		: [];

	const [positionRows, partyRows] = await Promise.all([
		db.select({ id: positions.id, title: positions.title, region: positions.region }).from(positions).where(isNull(positions.deletedAt)).orderBy(asc(positions.title), asc(positions.region)),
		db.select({ id: parties.id, name: parties.name, abbreviation: parties.abbreviation }).from(parties).where(isNull(parties.deletedAt)).orderBy(asc(parties.name))
	]);

	return {
		positions: positionRows,
		parties: partyRows.map((p) => ({ id: p.id, name: p.abbreviation ? `${p.name} (${p.abbreviation})` : p.name })),
		roles: CAMPAIGN_ROLES,
		statusOptions: (Object.keys(ONBOARD_STATUS_LABELS) as OnboardStatus[]).map((value) => ({ value, label: ONBOARD_STATUS_LABELS[value] })),
		// Prefill with the claim target's name if arriving via "Claim this profile",
		// else the citizen's own — the common case is a leader onboarding themselves.
		defaults: claimTarget
			? { firstName: claimTarget.firstName, otherNames: claimTarget.otherNames }
			: { firstName: domainUser.firstName, otherNames: domainUser.otherNames },
		preselectSubjectId: claimTarget?.id ?? null,
		preselectName: claimTarget ? fullName(claimTarget) : null
	};
};

export const actions: Actions = {
	default: async (event) => {
		const { domainUser } = await requireDashboardUser(event);
		const form = await event.request.formData();

		const firstName = String(form.get('firstName') ?? '').trim();
		const otherNames = String(form.get('otherNames') ?? '').trim();
		const statusRaw = String(form.get('status') ?? '');
		const partyRaw = String(form.get('partyId') ?? '').trim(); // "none" = Independent, else a parties.id
		const partyId = partyRaw && partyRaw !== 'none' ? Number(partyRaw) || null : null;
		const positionId = Number(form.get('positionId') ?? 0) || null;
		const myRole = String(form.get('myRole') ?? '').trim();
		const nationalId = String(form.get('nationalId') ?? '').trim();
		const linkSubjectId = Number(form.get('leaderId') ?? 0) || null; // set when a matching card was confirmed

		const values = { firstName, otherNames, status: statusRaw, partyId, positionId, myRole, nationalId, linkSubjectId };

		if (!firstName || /\s/.test(firstName)) return fail(400, { error: 'First name is required and must be a single word.', values });
		if (!otherNames) return fail(400, { error: 'Other names are required.', values });
		if (!(statusRaw in ONBOARD_STATUS_LABELS)) return fail(400, { error: 'Choose whether the leader is a new aspirant, current, or former.', values });
		if (!partyRaw) return fail(400, { error: 'Choose a party, or Independent / none.', values });
		if (!positionId) return fail(400, { error: 'Choose the elective position.', values });
		if (!myRole || !(CAMPAIGN_ROLES as readonly string[]).includes(myRole)) return fail(400, { error: 'Choose your role.', values });
		if (!isValidNationalId(nationalId)) return fail(400, { error: 'Enter a valid national ID number (7–8 digits).', values });
		if (partyId) {
			const [party] = await db.select({ id: parties.id }).from(parties).where(and(eq(parties.id, partyId), isNull(parties.deletedAt)));
			if (!party) return fail(400, { error: 'That party does not exist.', values });
		}

		const input = { firstName, otherNames, status: statusRaw as OnboardStatus, partyId, positionId, myRole, nationalId };

		let result: { slug: string; subjectUserId: number };
		try {
			result = linkSubjectId
				? await linkOnboardProfile(domainUser.id, input, linkSubjectId)
				: await createOnboardProfile(domainUser.id, input);
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Could not create the profile.', values });
		}

		// Carry the new/linked profile into plan selection (step 4).
		redirect(303, `/onboard/plan?subject=${result.subjectUserId}`);
	}
};
