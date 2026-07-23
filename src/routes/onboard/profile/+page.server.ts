import { fail, redirect } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { requireDashboardUser } from '$lib/server/dashboard';
import { fullName } from '$lib/server/leader';
import { assertClaimable, validateOnboardInput } from '$lib/server/onboard';
import { CAMPAIGN_ROLES } from '$lib/utils/campaignRoles';
import type { Actions, PageServerLoad } from './$types';

// Step 3 of the onboarding wizard: describe the leader, match against seeded profiles,
// then create or link one. Submit lands on /onboard/plan (step 4). Name + role only —
// leadership status, seat, party, and a run are all filled in later on the dashboard's
// own Profile/Campaign tabs, at zero friction before payment.
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
	const isStepBack = !!sp.get('myRole');
	const stepBack = isStepBack
		? {
				firstName: sp.get('firstName') ?? '',
				otherNames: sp.get('otherNames') ?? '',
				myRole: sp.get('myRole') ?? '',
				linkSubjectId: Number(sp.get('linkSubjectId') ?? 0) || null
			}
		: null;

	return {
		roles: CAMPAIGN_ROLES,
		// Stepping back wins; else the claim target's name; else the citizen's own —
		// the common case is a leader onboarding themselves. Same shape every branch
		// so the client can read every field uniformly regardless of how this page
		// was reached.
		defaults: stepBack ?? {
			firstName: claimTarget?.firstName ?? domainUser.firstName,
			otherNames: claimTarget?.otherNames ?? domainUser.otherNames,
			myRole: '',
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
			myRole: String(form.get('myRole') ?? '')
		};
		const linkSubjectId = Number(form.get('leaderId') ?? 0) || null; // set when a matching card was confirmed
		const values = { ...raw, linkSubjectId };

		const validated = validateOnboardInput(raw);
		if (!validated.ok) return fail(400, { error: validated.error, values });

		if (linkSubjectId) {
			const claimable = await assertClaimable(linkSubjectId);
			if (!claimable.ok) return fail(400, { error: claimable.error, values });
		}

		// Carry everything into Plan (step 4) as query params — Checkout's Pay action
		// re-validates and actually creates/links the profile once payment succeeds.
		const params = new URLSearchParams({ firstName: validated.input.firstName, otherNames: validated.input.otherNames, myRole: validated.input.myRole });
		if (linkSubjectId) params.set('linkSubjectId', String(linkSubjectId));
		redirect(303, `/onboard/plan?${params}`);
	}
};
