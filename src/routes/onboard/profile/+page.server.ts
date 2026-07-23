import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { parties, positions, users } from '$lib/server/db/schema';
import { requireDashboardUser } from '$lib/server/dashboard';
import { fullName } from '$lib/server/leader';
import { assertClaimable, validateOnboardInput } from '$lib/server/onboard';
import { CAMPAIGN_ROLES } from '$lib/utils/campaignRoles';
import type { Actions, PageServerLoad } from './$types';

// Step 3 of the onboarding wizard: describe the leader, match against seeded profiles,
// then create or link one. Submit lands on /onboard/plan (step 4). Party isn't asked
// here — a fresh application has no leaders/campaigns row yet to attach it to; it's
// set on the "+ Elected" term editor or the Campaign tab once one exists.
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
	const isStepBack = !!(sp.get('myRole') || sp.get('currentPositionId') || sp.get('formerPositionId') || sp.get('aspirantPositionId'));
	const stepBack = isStepBack
		? {
				firstName: sp.get('firstName') ?? '',
				otherNames: sp.get('otherNames') ?? '',
				myRole: sp.get('myRole') ?? '',
				currentChecked: sp.get('currentChecked') ?? '',
				currentPositionId: Number(sp.get('currentPositionId') ?? 0) || ('' as const),
				currentPartyId: sp.get('currentPartyId') ?? '',
				currentPartyOther: sp.get('currentPartyOther') ?? '',
				formerChecked: sp.get('formerChecked') ?? '',
				formerPositionId: Number(sp.get('formerPositionId') ?? 0) || ('' as const),
				formerFromYear: sp.get('formerFromYear') ?? '',
				formerToYear: sp.get('formerToYear') ?? '',
				formerPartyId: sp.get('formerPartyId') ?? '',
				formerPartyOther: sp.get('formerPartyOther') ?? '',
				aspirantChecked: sp.get('aspirantChecked') ?? '',
				aspirantPositionId: Number(sp.get('aspirantPositionId') ?? 0) || ('' as const),
				aspirantYear: sp.get('aspirantYear') ?? '',
				aspirantPartyId: sp.get('aspirantPartyId') ?? '',
				aspirantPartyOther: sp.get('aspirantPartyOther') ?? '',
				linkSubjectId: Number(sp.get('linkSubjectId') ?? 0) || null
			}
		: null;

	const positionRows = await db
		.select({ id: positions.id, title: positions.title, region: positions.region })
		.from(positions)
		.where(isNull(positions.deletedAt))
		.orderBy(asc(positions.title), asc(positions.region));

	const partyRows = await db
		.select({ id: parties.id, name: parties.name, abbreviation: parties.abbreviation })
		.from(parties)
		.where(isNull(parties.deletedAt))
		.orderBy(asc(parties.name));

	return {
		positions: positionRows,
		parties: partyRows.map((p) => ({ id: p.id, name: p.abbreviation ? `${p.name} (${p.abbreviation})` : p.name })),
		roles: CAMPAIGN_ROLES,
		// Stepping back wins; else the claim target's name; else the citizen's own —
		// the common case is a leader onboarding themselves. Same shape every branch
		// (empty strings for fields that branch doesn't have) so the client can read
		// every field uniformly regardless of how this page was reached.
		defaults: stepBack ?? {
			firstName: claimTarget?.firstName ?? domainUser.firstName,
			otherNames: claimTarget?.otherNames ?? domainUser.otherNames,
			myRole: '',
			currentChecked: '',
			currentPositionId: '' as const,
			currentPartyId: '',
			currentPartyOther: '',
			formerChecked: '',
			formerPositionId: '' as const,
			formerFromYear: '',
			formerToYear: '',
			formerPartyId: '',
			formerPartyOther: '',
			aspirantChecked: '',
			aspirantPositionId: '' as const,
			aspirantYear: '',
			aspirantPartyId: '',
			aspirantPartyOther: '',
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
			myRole: String(form.get('myRole') ?? ''),
			currentChecked: String(form.get('currentChecked') ?? ''),
			currentPositionId: String(form.get('currentPositionId') ?? ''),
			currentPartyId: String(form.get('currentPartyId') ?? ''),
			currentPartyOther: String(form.get('currentPartyOther') ?? ''),
			formerChecked: String(form.get('formerChecked') ?? ''),
			formerPositionId: String(form.get('formerPositionId') ?? ''),
			formerFromYear: String(form.get('formerFromYear') ?? ''),
			formerToYear: String(form.get('formerToYear') ?? ''),
			formerPartyId: String(form.get('formerPartyId') ?? ''),
			formerPartyOther: String(form.get('formerPartyOther') ?? ''),
			aspirantChecked: String(form.get('aspirantChecked') ?? ''),
			aspirantPositionId: String(form.get('aspirantPositionId') ?? ''),
			aspirantYear: String(form.get('aspirantYear') ?? ''),
			aspirantPartyId: String(form.get('aspirantPartyId') ?? ''),
			aspirantPartyOther: String(form.get('aspirantPartyOther') ?? '')
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
		if (validated.input.current) {
			params.set('currentChecked', 'on');
			params.set('currentPositionId', String(validated.input.current.positionId));
			if (validated.input.current.partyOther) {
				params.set('currentPartyId', 'other');
				params.set('currentPartyOther', validated.input.current.partyOther);
			} else if (validated.input.current.partyId) {
				params.set('currentPartyId', String(validated.input.current.partyId));
			}
		}
		if (validated.input.former) {
			params.set('formerChecked', 'on');
			params.set('formerPositionId', String(validated.input.former.positionId));
			params.set('formerFromYear', String(validated.input.former.fromYear));
			params.set('formerToYear', String(validated.input.former.toYear));
			if (validated.input.former.partyOther) {
				params.set('formerPartyId', 'other');
				params.set('formerPartyOther', validated.input.former.partyOther);
			} else if (validated.input.former.partyId) {
				params.set('formerPartyId', String(validated.input.former.partyId));
			}
		}
		if (validated.input.aspirant) {
			params.set('aspirantChecked', 'on');
			params.set('aspirantPositionId', String(validated.input.aspirant.positionId));
			params.set('aspirantYear', String(validated.input.aspirant.year));
			if (validated.input.aspirant.partyOther) {
				params.set('aspirantPartyId', 'other');
				params.set('aspirantPartyOther', validated.input.aspirant.partyOther);
			} else if (validated.input.aspirant.partyId) {
				params.set('aspirantPartyId', String(validated.input.aspirant.partyId));
			}
		}
		if (linkSubjectId) params.set('linkSubjectId', String(linkSubjectId));
		redirect(303, `/onboard/plan?${params}`);
	}
};
