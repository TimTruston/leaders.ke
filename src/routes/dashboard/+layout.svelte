<script lang="ts">
	import { enhance } from '$app/forms';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { computeDashboardModes } from '$lib/utils/dashboardModes';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	let submittingApplication = $state(false);
	let applicationError = $state('');

	// Delete (application or claim) goes through a confirmation modal: the button
	// click is intercepted, and confirming re-submits its form with the button as
	// the submitter, so the button's formaction still picks the delete action.
	let deleteBtn = $state<HTMLButtonElement | null>(null);
	const confirmDelete = (e: MouseEvent) => {
		e.preventDefault();
		deleteBtn = e.currentTarget as HTMLButtonElement;
	};

	// Platform-admin control bar (Deactivate/Activate, Declare Winner, Delete). The
	// clicked button stages the pending action + its confirm wording; confirming writes
	// the action onto the shared hidden form and submits it to the profile-action endpoint.
	let adminAction = $state<{ action: string; title: string; body: string; confirmLabel: string } | null>(null);
	let adminFormEl = $state<HTMLFormElement | null>(null);
	let adminActionEl = $state<HTMLInputElement | null>(null);

	// Set by /invite/[token] right after accepting — a one-time "you're in" banner.
	const joinedRole = $derived(page.url.searchParams.get('joined'));
	const joinedLeaderName = $derived(page.url.searchParams.get('leaderName'));
	const joinedMessage = $derived.by(() => {
		if (joinedRole === 'manager') return `You're now a manager of ${joinedLeaderName}`;
		if (joinedRole === 'ambassador') return `You're now an ambassador for ${joinedLeaderName}`;
		if (joinedRole === 'follower') return `You're now following ${joinedLeaderName}`;
		return null;
	});

	// Generic one-off banner (e.g. "Your email is already verified.") set as a
	// flash cookie by whichever route redirected here (see $lib/server/flash.ts).
	// Normally hooks consume the cookie and it arrives via data.flash — but when a
	// redirect lands on the SAME url the user was already on, no server load
	// re-runs, so read (and clear) the cookie client-side after each navigation.
	let clientFlash = $state<string | null>(null);
	afterNavigate(() => {
		const match = document.cookie.match(/(?:^|;\s*)flash=([^;]+)/);
		if (match) {
			clientFlash = decodeURIComponent(match[1]);
			document.cookie = 'flash=; path=/; max-age=0';
		} else {
			clientFlash = null;
		}
	});
	const notice = $derived(clientFlash ?? data.flash);

	// Which mode the current URL/state belongs to. The section nav below shows only this
	// mode's tabs, so switching modes changes what's available, not just the open tab.
	// Matched on the exact second path segment — a prefix test would misfile campaign
	// slugs that merely start with a mode name (/dashboard/admin-tim/* is NOT admin).
	// Leader route families: apply/[id]/* (application in progress), claim/[slug]/*
	// (claiming an existing profile), [slug]/* (a verified campaign).
	const mode = $derived.by(() => {
		const second = page.url.pathname.split('/')[2];
		if (second === 'admin') return 'admin';
		if (second === 'apply') return 'apply';
		if (second === 'claim') return 'claim';
		// mobilize/* = ambassador work, deliberately a citizen tab: an ambassador is
		// a citizen with extra duties, not a separate dashboard context.
		if (!second || second === 'account' || second === 'invites' || second === 'mobilize') return 'citizen';
		return 'campaign';
	});

	// The base path of the leader family currently on screen (tab hrefs, Submit
	// Application action). Falls back to the viewer's own campaign/application.
	const base = $derived.by(() => {
		if (mode === 'apply') return `/dashboard/apply/${page.params.id}`;
		if (mode === 'claim') return `/dashboard/claim/${page.params.slug}`;
		return data.leaderContext?.basePath ?? '/dashboard';
	});

	// The modes this account can switch between right now — rendered by the root
	// Header (it's above this layout in the tree), computed from the same page
	// data/URL this layout already has so it's identical either place.
	const modes = $derived(computeDashboardModes(page.url.pathname, page.params, data));

	// This mode's tabs. Only pages that actually exist are listed (no dead links);
	// every listed tab is always reachable, so no per-tab enable flag is needed.
	const sections = $derived.by(() => {
		switch (mode) {
			case 'citizen':
				// One tab per ambassador assignment, titled with the leader's name —
				// ambassador work is part of citizen life, not a separate mode.
				return [
					{ href: '/dashboard', label: 'Overview' },
					{ href: '/dashboard/invites', label: 'Invites' },
					...data.ambassadorFor.map((a: { subjectId: number; name: string }) => ({
						href: `/dashboard/mobilize/${a.subjectId}`,
						label: a.name
					})),
					{ href: '/dashboard/account', label: 'Account' }
				];
			// Application flow (reached via "Launch a Campaign") and claims share
			// Profile/Contacts. The photo + IEBC certificate live on the Profile tab
			// now (the Documentation tab is gone). The applicant's sign-off attestation
			// is embedded on the Team tab (under their own manager entry), so apply has
			// no separate Signoff tab; Team needs 2+ managers and a completed sign-off
			// before an application can be submitted. Claims have no Team tab
			// (management belongs to the profile's admins), so they keep a standalone
			// Signoff tab. Everything beyond Profile/Contacts hangs off the saved
			// profile, so Team only appears once one exists.
			case 'apply':
				// Contacts/Team unlock once a profile has been saved (they attach to the
				// person that first save creates).
				return [
					{ href: `${base}/profile`, label: 'Leader' },
					...(data.leaderContext
						? [
								{ href: `${base}/contacts`, label: 'Contacts' },
								{ href: `${base}/campaign`, label: 'Campaign' },
								{ href: `${base}/team`, label: 'Team' }
							]
						: [])
				];
			case 'claim':
				// Contacts/Signoff unlock once the claimant has saved the Profile tab —
				// same gating as apply mode's Contacts/Team.
				return [
					{ href: `${base}/profile`, label: 'Leader' },
					...(data.application?.profile.complete
						? [
								{ href: `${base}/contacts`, label: 'Contacts' },
								{ href: `${base}/signoff`, label: 'Signoff' }
							]
						: [])
				];
			case 'campaign':
				return [
					{ href: `${base}/profile`, label: 'Leader' },
					{ href: `${base}/contacts`, label: 'Contacts' },
					{ href: `${base}/campaign`, label: 'Campaign' },
					{ href: `${base}/manifesto`, label: 'Manifesto' },
					{ href: `${base}/posts`, label: 'Posts' },
					{ href: `${base}/reviews`, label: 'Reviews' },
					{ href: `${base}/team`, label: 'Team' },
					{ href: `${base}/followers`, label: 'Followers' },
					{ href: `${base}/broadcasts`, label: 'Broadcasts' },
					{ href: `${base}/fundraising`, label: 'Fundraising' },
					{ href: `${base}/pr`, label: 'PR desk' },
					{ href: `${base}/competitors`, label: 'Competitors' }
				];
			case 'admin':
				return [
					{ href: '/dashboard/admin/profiles', label: 'Profiles' },
					{ href: '/dashboard/admin/accounts', label: 'Accounts' },
					{ href: '/dashboard/admin/pillars', label: 'Pillars' },
					{ href: '/dashboard/admin/moderation', label: 'Moderation' },
					{ href: '/dashboard/admin/subscriptions', label: 'Subscriptions & revenue' },
					{ href: '/dashboard/admin/packages', label: 'Packages' },
					{ href: '/dashboard/admin/settings', label: 'Settings' }
				];
		}
	});

	// Apply-flow tabs that still have missing required fields get a `*` on their title.
	// Keyed on the tab's last path segment (hrefs carry the family base); only
	// meaningful while `application` is present (apply mode, not yet verified).
	const applyTabKeys: Record<string, keyof NonNullable<typeof data.application>> = {
		profile: 'profile',
		contacts: 'contacts',
		campaign: 'campaign',
		team: 'team',
		signoff: 'signoff'
	};
	const tabIncomplete = (href: string) => {
		if (!data.application) return false;
		const seg = href.split('/').pop() ?? '';
		// The Profile tab now hosts the photo + IEBC certificate (old Documentation
		// tab), so it flags when either the profile fields or documentation are short.
		if (seg === 'profile') return !data.application.profile.complete || !data.application.documentation.complete;
		// The Team tab hosts the embedded sign-off, so it flags when either the team
		// or the sign-off is still incomplete.
		if (seg === 'team') return !data.application.team.complete || !data.application.signoff.complete;
		const key = applyTabKeys[seg];
		return !!(key && !data.application[key].complete);
	};

	// Every still-missing field across all four tabs — powers the Submit Application
	// tooltip so the user sees exactly what's outstanding, not just a disabled button.
	const missingFields = $derived(
		data.application
			? [
					...data.application.profile.missing,
					...data.application.contacts.missing,
					...data.application.campaign.missing,
					...data.application.team.missing,
					...data.application.documentation.missing,
					...data.application.signoff.missing
				]
			: []
	);

	// The ambassador assignment whose mobilize tab is on screen, if any — drives
	// the "Ambassador of [Name]" subheading on the citizen view.
	const activeAssignment = $derived.by(() => {
		const [, , second, third] = page.url.pathname.split('/');
		if (second !== 'mobilize') return null;
		return data.ambassadorFor.find((a: { subjectId: number; name: string }) => a.subjectId === Number(third)) ?? null;
	});

	// Exact match for any tab that's a URL-prefix of a sibling tab (e.g. Overview at
	// /dashboard vs. /dashboard/account) — otherwise both would light up.
	const isActive = (href: string) =>
		sections.some((s) => s.href !== href && s.href.startsWith(href))
			? page.url.pathname === href
			: page.url.pathname.startsWith(href);

</script>

<section class="mx-auto max-w-7xl px-4 py-8 sm:px-6">
	{#if joinedMessage}
		<div class="mb-4 rounded-xl bg-primary-soft p-4 text-sm font-medium text-on-primary">{joinedMessage}</div>
	{:else if notice}
		<div class="mb-4 rounded-xl bg-primary-soft p-4 text-sm font-medium text-on-primary">{notice}</div>
	{/if}

	<!-- Durable decision notifications (verification/claim outcomes) — bannered until dismissed -->
	{#each data.notifications as item (item.id)}
		<div class="mb-4 flex items-start justify-between gap-3 rounded-xl bg-primary-soft p-4 text-on-primary">
			<div class="min-w-0 text-sm">
				<p class="font-semibold">{item.title}</p>
				<p class="mt-0.5 whitespace-pre-line">{item.body}</p>
			</div>
			<!-- Plain POST (no enhance): the endpoint is a +server.ts returning a 303
			back to this page, not a form action returning an ActionResult. -->
			<form method="post" action="/dashboard/notifications">
				<input type="hidden" name="id" value={item.id} />
				<button
					type="submit"
					aria-label="Dismiss notification"
					class="rounded-md px-2 py-1 text-sm font-semibold transition hover:bg-on-primary/10"
				>
					✕
				</button>
			</form>
		</div>
	{/each}

	<!-- Headers -->

	<div class="flex flex-wrap items-center justify-between gap-2">
		<div class="flex items-center justify-between gap-2 w-full">
			{#if data.claimName}
				<!-- The claim family (/dashboard/claim/[slug]/*) is about someone else's
				profile, whatever campaign context the viewer otherwise has. -->
				<div class="flex flex-wrap items-center justify-between gap-2 w-full">
					<h1 class="text-2xl font-bold text-heading">Claiming "{data.claimName}"</h1>
					{#if data.application?.profile.complete && data.claimSubjectSlug && data.claimId}
						<a
							href="/{data.claimSubjectSlug}/claims/{data.claimId}"
							target="_blank"
							rel="noopener"
							class="rounded-full border border-border px-3 py-1 text-xs font-semibold text-heading transition hover:bg-surface-2"
						>
							Preview &#8599;
						</a>
					{/if}
				</div>
			{:else if mode === 'campaign' && data.leaderContext}
				<h1 class="text-2xl font-bold text-heading">
					{data.leaderContext.leaderName}
					{#if data.leaderContext.role === 'manager'}
						<span
							class="ml-1 align-middle rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-muted"
						>
							Managing
						</span>
					{/if}
				</h1>
			{:else if mode === 'apply'}
				<div class="flex flex-wrap items-center justify-between gap-2 w-full">
					<h1 class="text-2xl font-bold text-heading">Lets get onboard!</h1>
					{#if data.leaderContext}
						<a
							href={data.leaderContext.previewPath}
							target="_blank"
							rel="noopener"
							class="rounded-full border border-border px-3 py-1 text-xs font-semibold text-heading transition hover:bg-surface-2"
						>
							Preview &#8599;
						</a>
					{/if}
				</div>
			{:else}
				<h1 class="text-2xl font-bold text-heading">Welcome, {data.firstName}</h1>
			{/if}
		</div>

		<div class="flex flex-wrap items-center justify-between gap-2 w-full">
			<!-- Submit Application: apply mode only, gated on every tab (Profile/Contacts
			minus website+socials/Team 2+/Documentation) being filled in. -->
			{#if data.claimName}
				<!-- Claim widget: mirrors Submit Application, but finalizes the staged
				claim (national ID → evidence) — Delete drops a just-testing claim. -->
				<span class="flex items-center text-sm my-2 sm:my-0">
					Confirm the details below to claim this profile...
				</span>
				{#if data.claimSubmitted}
					<span
						class="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-semibold text-muted"
					>
						Claim submitted — pending review
					</span>
				{:else}
					<form
						method="post"
						action="{base}/profile?/submitClaim"
						class="w-full sm:w-auto flex items-center justify-between gap-2"
						use:enhance={() => {
							submittingApplication = true;
							applicationError = '';
							return async ({ result, update }) => {
								submittingApplication = false;
								if (result.type === 'failure') {
									applicationError = (result.data?.claimError as string) ?? 'Could not submit.';
								}
								await update();
							};
						}}
					>
						<button
							type="submit"
							disabled={!data.applicationComplete || submittingApplication}
							title={data.applicationComplete
								? ''
								: `Still needed before you can submit:\n• ${missingFields.join('\n• ')}`}
							class="shrink-0 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{submittingApplication ? 'Submitting…' : data.claimRejection ? 'Resubmit Claim' : 'Submit Claim'}
						</button>
						<button
							type="submit"
							formaction="{base}/profile?/deleteClaim"
							formnovalidate
							onclick={confirmDelete}
							class="shrink-0 rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-muted transition hover:bg-surface-2 hover:text-heading"
						>
							Delete
						</button>
					</form>
				{/if}
			{:else if mode === 'apply'}
				<span class="flex items-center text-sm my-2 sm:my-0">
					A few steps to go public ahead of 10 August 2027...
				</span>
				{#if data.pendingVerification}
					<span
						class="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-semibold text-muted"
					>
						Application submitted — pending review
					</span>
				{:else}
					<form
						method="post"
						action="{base}/profile?/requestVerification"
						class="w-full sm:w-auto flex items-center justify-between gap-2 "
						use:enhance={() => {
							submittingApplication = true;
							applicationError = '';
							return async ({ result, update }) => {
								submittingApplication = false;
								if (result.type === 'failure') {
									applicationError = (result.data?.verificationError as string) ?? 'Could not submit.';
								}
								await update();
							};
						}}
					>
						<button
							type="submit"
							disabled={!data.applicationComplete || submittingApplication}
							title={data.applicationComplete
								? ''
								: `Still needed before you can submit:\n• ${missingFields.join('\n• ')}`}
							class="shrink-0 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{submittingApplication ? 'Submitting…' : 'Submit Application'}
						</button>
						{#if data.leaderContext}
							<button
								type="submit"
								formaction="{base}/profile?/deleteApplication"
								formnovalidate
								onclick={confirmDelete}
								class="shrink-0 rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-muted transition hover:bg-surface-2 hover:text-heading"
							>
								Delete
							</button>
						{/if}
					</form>
				{/if}
			{:else if mode === 'campaign' && data.leaderContext}
				<p class="text-sm text-muted">
					{data.leaderContext.positionTitle}, {data.leaderContext.region}
					· <span class="capitalize">{data.leaderContext.status}</span>
				</p>
				{#if data.leaderContext.verified}
					<a
						href={data.leaderContext.publicPath}
						target="_blank"
						class="rounded-full border border-primary px-4 py-1.5 text-xs font-semibold text-primary transition bg-surface hover:bg-primary hover:text-on-primary"
					>
						View &#8599;
					</a>
				{:else}
					<span
						class="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1 text-sm font-semibold text-muted"
					>
						Pending verification
					</span>
				{/if}
			{:else if activeAssignment}
				<p class="text-sm text-muted">Ambassador of {activeAssignment.name}</p>
			{:else}
				<p class="text-sm text-muted uppercase">{mode}</p>
			{/if}

		</div>
	</div>

	<!-- Inline approve/reject decision form (claim or verification) — identical but for
	its action + target-id field; posts to the shared admin endpoint. -->
	{#snippet decisionForm(action: string, idName: string, idValue: number)}
		<form method="post" action="/dashboard/admin/profile-action" class="mt-1 flex w-full flex-wrap items-center gap-2 border-t border-border pt-2">
			<input type="hidden" name="action" value={action} />
			<input type="hidden" name={idName} value={idValue} />
			<input type="hidden" name="next" value={page.url.pathname} />
			<input type="text" name="notes" placeholder="Reason for rejection" class="min-w-48 flex-1 rounded-full border border-border bg-surface px-3 py-1 text-xs text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none" />
			<button type="submit" name="outcome" value="rejected" class="rounded-full border border-border px-3 py-1 text-xs font-semibold text-heading transition hover:bg-surface">Reject</button>
			<button type="submit" name="outcome" value="approved" class="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-on-primary transition hover:brightness-95">Approve</button>
		</form>
	{/snippet}

	<!-- Platform-admin control bar: shown on ANY profile a platform admin opens via the
	Profiles tab "Admin" button. Source + verified badges, then the destructive lifecycle
	actions, each behind a confirm modal with its own wording. -->
	{#if data.adminControls}
		{@const ac = data.adminControls}
		<div class="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2">
			<span class="text-xs font-semibold text-muted">Admin</span>
			<span
				title="How the profile came to exist: has a claim → claimed; else has an active manager → applied; else → seeded."
				class="cursor-help rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize {ac.source === 'applied' ? 'bg-primary-soft text-on-primary' : ac.source === 'claimed' ? 'bg-surface text-heading' : 'border border-border text-muted'}"
			>{ac.source}</span>
			<!-- Who applied/claimed + how to reach them. A pending claim (ac.claim) names the
			claimant; otherwise the controlling manager (ac.application) is the applicant, or
			the now-approved claimant. -->
			{#if ac.claim}
				<span class="text-xs text-muted">by <span class="font-medium text-heading">{ac.claim.claimantName}</span>{#if ac.claim.email} · {ac.claim.email}{/if}{#if ac.claim.phone} · {ac.claim.phone}{/if}</span>
			{:else if ac.application}
				<span class="text-xs text-muted">by <span class="font-medium text-heading">{ac.application.applicantName}</span>{#if ac.application.email} · {ac.application.email}{/if}{#if ac.application.phone} · {ac.application.phone}{/if}</span>
			{/if}
			<span
				title="Review-workflow state: seeded → —; claimed → latest claim outcome; applied → run verified/latest request; soft-deleted → deleted."
				class="cursor-help rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize {ac.verified === 'approved' ? 'bg-primary-soft text-on-primary' : ac.verified === 'pending' ? 'border border-primary text-primary' : 'border border-border text-muted'}"
			>{ac.verified ?? '—'}</span>

			<div class="ml-auto flex flex-wrap items-center gap-2">
				{#if ac.deactivated}
					<button
						type="button"
						onclick={() => (adminAction = { action: 'activate', title: 'Reactivate this profile?', body: `${ac.profileName}'s profile becomes publicly visible again.`, confirmLabel: 'Activate' })}
						class="rounded-full border border-primary px-3 py-1 text-xs font-semibold text-primary transition hover:bg-primary hover:text-on-primary"
					>Activate</button>
				{:else}
					<button
						type="button"
						onclick={() => (adminAction = { action: 'deactivate', title: 'Deactivate this profile?', body: `${ac.profileName}'s profile is hidden from the public and the roster until you reactivate it.`, confirmLabel: 'Deactivate' })}
						class="rounded-full border border-border px-3 py-1 text-xs font-semibold text-heading transition hover:bg-surface"
					>Deactivate</button>
				{/if}
				{#if ac.graduatableCampaignId}
					<button
						type="button"
						onclick={() => (adminAction = { action: 'declareWinner', title: 'Declare winner?', body: `Graduates ${ac.profileName}'s verified run into a current term and retires the seat's sitting holder. This cannot be undone.`, confirmLabel: 'Declare Winner' })}
						class="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-on-primary transition hover:brightness-95"
					>Declare Winner</button>
				{/if}
				{#if !ac.deactivated}
					<button
						type="button"
						onclick={() => (adminAction = { action: 'delete', title: 'Delete this profile?', body: `Soft-deletes ${ac.profileName}'s profile and all its terms, campaigns and claims. It disappears from every leader surface.`, confirmLabel: 'Delete' })}
						class="rounded-full border border-red-500/40 px-3 py-1 text-xs font-semibold text-red-500 transition hover:bg-red-500/10"
					>Delete</button>
				{/if}
			</div>

			<!-- Claim decision (was the Team-tab banner): approve grants the claimant manager access. -->
			{#if ac.claim}{@render decisionForm('reviewClaim', 'claimId', ac.claim.id)}{/if}
			<!-- Verification decision (was the Campaign-tab banner): approve takes the run live.
			The slug is set on the Profile tab, not here. -->
			{#if ac.verification}{@render decisionForm('reviewVerification', 'verificationId', ac.verification.id)}{/if}

			<!-- One form the confirm modal submits; the chosen action is written straight
			onto the hidden input before requestSubmit so no reactive flush is needed. -->
			<form method="post" action="/dashboard/admin/profile-action" bind:this={adminFormEl} class="hidden">
				<input type="hidden" name="profileId" value={ac.profileId} />
				<input type="hidden" name="next" value={page.url.pathname} />
				<input type="hidden" name="action" bind:this={adminActionEl} />
			</form>
		</div>
	{/if}

	<!-- Rejection feedback: the admin's reason from the last review, shown until the
	applicant re-submits (getLatestRejection stops returning it once a new request is pending). -->
	{#if mode === 'apply' && data.rejection}
		<div class="mt-3 rounded-xl border border-red-500/40 bg-red-500/5 p-4">
			<p class="text-sm font-semibold text-red-500">Your application was not approved.</p>
			{#if data.rejection.notes}
				<p class="mt-1 text-sm text-heading">{data.rejection.notes}</p>
			{:else}
				<p class="mt-1 text-sm text-muted">No reason was given. Review your details and re-submit.</p>
			{/if}
		</div>
	{:else if mode === 'claim' && data.claimRejection}
		<!-- Same shape, but the claim itself stays open for editing — resubmitting
		reopens this same claim rather than starting a fresh one. -->
		<div class="mt-3 rounded-xl border border-red-500/40 bg-red-500/5 p-4">
			<p class="text-sm font-semibold text-red-500">Your claim was not approved.</p>
			{#if data.claimRejection.notes}
				<p class="mt-1 text-sm text-heading">{data.claimRejection.notes}</p>
			{:else}
				<p class="mt-1 text-sm text-muted">No reason was given. Review your details and re-submit.</p>
			{/if}
		</div>
	{/if}
	<!-- Consolidated checklist: collapsed to just its title, click to expand the
	full list of what's still outstanding across every tab. -->
	<!-- The layout load computes `application` off the viewer's own context even on
	citizen pages, so also gate on the modes the checklist belongs to. -->
	{#if data.application && (mode === 'apply' || mode === 'claim')}
		<div class="flex items-center">
			{#if missingFields.length > 0}
				<div class="mt-3 flex flex-wrap gap-1.5 text-sm text-muted">
					<span class="">Required: </span>
					{#each missingFields as field, i (field)}
					<span>{field}{i < missingFields.length - 1 ? ',' : ''}</span>
					{/each}
				</div>
			{/if}
			{#if applicationError}
				<p class="text-right text-xs text-red-500">{applicationError}</p>
			{/if}
		</div>
	{/if}

	<!-- Section nav: only when the mode has more than one tab. -->
	{#if sections.length > 1}
		<nav class="mt-1 overflow-x-auto border-b border-border" aria-label="Dashboard sections">
			<div class="flex w-max gap-1">
				{#each sections as section (section.href)}
					<a
						href={section.href}
						aria-current={isActive(section.href) ? 'page' : undefined}
						class="whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition {isActive(
							section.href
						)
							? 'border-primary text-heading'
							: 'border-transparent text-muted hover:text-heading'}"
					>
						{section.label}{#if tabIncomplete(section.href)}<span
								class="ml-0.5 text-red-500"
								title="This tab has missing required fields">*</span
							>{/if}
					</a>
				{/each}
			</div>
		</nav>
	{/if}

	<div class="mt-6">
		{@render children()}
	</div>

</section>

{#if deleteBtn}
	<ConfirmDialog
		title={mode === 'claim' ? 'Delete this claim?' : 'Delete this application?'}
		body="Everything entered so far is discarded and it drops off your dashboard. This cannot be undone."
		oncancel={() => (deleteBtn = null)}
		onconfirm={() => {
			const btn = deleteBtn;
			deleteBtn = null;
			btn?.form?.requestSubmit(btn);
		}}
	/>
{/if}

{#if adminAction}
	<ConfirmDialog
		title={adminAction.title}
		body={adminAction.body}
		confirmLabel={adminAction.confirmLabel}
		oncancel={() => (adminAction = null)}
		onconfirm={() => {
			// Write the chosen action straight onto the hidden input, then submit.
			if (adminActionEl) adminActionEl.value = adminAction!.action;
			adminAction = null;
			adminFormEl?.requestSubmit();
		}}
	/>
{/if}
