import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { parties, positions, users } from '$lib/server/db/schema';
import { requireDashboardUser } from '$lib/server/dashboard';
import { fullName } from '$lib/server/leader';
import { assertClaimable, ONBOARD_STATUS_LABELS, validateOnboardInput, type OnboardStatus } from '$lib/server/onboard';
import { CAMPAIGN_ROLES } from '$lib/utils/campaignRoles';
import type { Actions, PageServerLoad } from './$types';

// Step 3 of the onboarding wizard: describe the leader, match against seeded profiles,
// then create or link one. Submit lands on /onboard/plan (step 4).
export const load: PageServerLoad = async (event) => {
	const { domainUser } = await requireDashboardUser(event);
	const sp = event.url.searchParams;

	// "Claim this profile" on a public page arrives here as ?profile=<slug> — prefill
	// the name from THAT profile (not the citizen's own) and hand the client its id so
	// the Matching Profiles panel can auto-select it once the (debounced) match lands.
	const claimSlug = sp.get('profile');
	const [claimTarget] = claimSlug
		? await db.select({ id: users.id, firstName: users.firstName, otherNames: users.otherNames }).from(users).where(and(eq(users.slug, claimSlug), isNull(users.deletedAt)))
		: [];

	// Stepping BACK here from Plan/Checkout carries every field this step collected
	// as query params (see the layout stepper) — no client-side persistence needed,
	// the URL already has it all. These win over both the claim-target and the
	// citizen's-own-name defaults below.
	const isStepBack = !!(sp.get('status') || sp.get('positionId') || sp.get('myRole'));
	const stepBack = isStepBack
		? {
				firstName: sp.get('firstName') ?? '',
				otherNames: sp.get('otherNames') ?? '',
				status: sp.get('status') ?? '',
				partyId: sp.get('partyId') ?? '',
				positionId: Number(sp.get('positionId') ?? 0) || ('' as const),
				myRole: sp.get('myRole') ?? '',
				nationalId: sp.get('nationalId') ?? '',
				linkSubjectId: Number(sp.get('linkSubjectId') ?? 0) || null
			}
		: null;

	const [positionRows, partyRows] = await Promise.all([
		db.select({ id: positions.id, title: positions.title, region: positions.region }).from(positions).where(isNull(positions.deletedAt)).orderBy(asc(positions.title), asc(positions.region)),
		db.select({ id: parties.id, name: parties.name, abbreviation: parties.abbreviation }).from(parties).where(isNull(parties.deletedAt)).orderBy(asc(parties.name))
	]);

	return {
		positions: positionRows,
		parties: partyRows.map((p) => ({ id: p.id, name: p.abbreviation ? `${p.name} (${p.abbreviation})` : p.name })),
		roles: CAMPAIGN_ROLES,
		statusOptions: (Object.keys(ONBOARD_STATUS_LABELS) as OnboardStatus[]).map((value) => ({ value, label: ONBOARD_STATUS_LABELS[value] })),
		// Stepping back wins; else the claim target's name; else the citizen's own —
		// the common case is a leader onboarding themselves. Same shape every branch
		// (empty strings for fields that branch doesn't have) so the client can read
		// every field uniformly regardless of how this page was reached.
		defaults: stepBack ?? {
			firstName: claimTarget?.firstName ?? domainUser.firstName,
			otherNames: claimTarget?.otherNames ?? domainUser.otherNames,
			status: '' as const,
			partyId: '',
			positionId: '' as const,
			myRole: '',
			nationalId: '',
			linkSubjectId: null
		},
		preselectSubjectId: stepBack?.linkSubjectId ?? claimTarget?.id ?? null,
		preselectName: claimTarget ? fullName(claimTarget) : null
	};
};

export const actions: Actions = {
	// Validates only — nothing is written to the database yet. Creating a phantom
	// profile (or granting claim access) here, before the citizen has actually paid,
	// would litter the namespace with abandoned drafts every time someone bails at
	// Plan or Checkout. The actual create/link happens in checkout's Pay action;
	// everything gathered here rides forward as query params instead.
	default: async (event) => {
		await requireDashboardUser(event);
		const form = await event.request.formData();

		const raw = {
			firstName: String(form.get('firstName') ?? ''),
			otherNames: String(form.get('otherNames') ?? ''),
			status: String(form.get('status') ?? ''),
			partyId: String(form.get('partyId') ?? ''),
			positionId: String(form.get('positionId') ?? ''),
			myRole: String(form.get('myRole') ?? ''),
			nationalId: String(form.get('nationalId') ?? '')
		};
		const linkSubjectId = Number(form.get('leaderId') ?? 0) || null; // set when a matching card was confirmed
		const values = { ...raw, linkSubjectId };

		const validated = validateOnboardInput(raw);
		if (!validated.ok) return fail(400, { error: validated.error, values });

		if (linkSubjectId) {
			const claimable = await assertClaimable(linkSubjectId);
			if (!claimable.ok) return fail(400, { error: claimable.error, values });
		} else if (validated.input.partyId) {
			const [party] = await db.select({ id: parties.id }).from(parties).where(and(eq(parties.id, validated.input.partyId), isNull(parties.deletedAt)));
			if (!party) return fail(400, { error: 'That party does not exist.', values });
		}

		// Carry everything into Plan (step 4) as query params — Checkout's Pay action
		// re-validates and actually creates/links the profile once payment succeeds.
		const params = new URLSearchParams({
			firstName: validated.input.firstName,
			otherNames: validated.input.otherNames,
			status: validated.input.status,
			partyId: raw.partyId.trim(),
			positionId: String(validated.input.positionId),
			myRole: validated.input.myRole,
			nationalId: validated.input.nationalId
		});
		if (linkSubjectId) params.set('linkSubjectId', String(linkSubjectId));
		redirect(303, `/onboard/plan?${params}`);
	}
};
