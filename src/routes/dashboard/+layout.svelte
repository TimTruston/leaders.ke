<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	let submittingApplication = $state(false);
	let applicationError = $state('');

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
	const notice = $derived(data.flash);

	// Which mode the current URL/state belongs to. The section nav below shows only this
	// mode's tabs, so switching modes changes what's available, not just the open tab.
	// Profile/Contacts/Team/Documentation are shared between "applying" and "an
	// established campaign": not yet verified (or no profile) means still applying,
	// derived from data so it's correct on every load regardless of which route you're on.
	const mode = $derived.by(() => {
		const p = page.url.pathname;
		if (p.startsWith('/dashboard/admin')) return 'admin';
		if (p.startsWith('/dashboard/ambassador')) return 'ambassador';
		if (p === '/dashboard' || p === '/dashboard/account' || p === '/dashboard/invites') return 'citizen';
		return data.leaderContext?.verified ? 'campaign' : 'apply';
	});

	// The modes this account can switch between right now.
	const modes = $derived(
		[
			{ key: 'citizen', href: '/dashboard', label: 'Citizen', available: true },
			{
				key: 'campaign',
				href: '/dashboard/profile',
				label: (data.leaderContext?.role === 'manager' ? 'Managing ' : 'Ambassador: ') + data.leaderContext?.leaderName,
				available: !!data.leaderContext
			},
			{ key: 'ambassador', href: '/dashboard/ambassador', label: 'Ambassador', available: data.isAmbassador },
			{ key: 'admin', href: '/dashboard/admin/verifications', label: 'Platform admin', available: data.isAdmin }
		].filter((m) => m.available)
	);
	// 'apply' is the pre-verification leader context, which shares the 'campaign' switcher
	// entry — without this map the lookup misses and wrongly falls back to Citizen.
	const currentMode = $derived(
		modes.find((m) => m.key === (mode === 'apply' ? 'campaign' : mode)) ?? modes[0]
	);

	// Tabs per mode. Only pages that actually exist are listed (no dead links); every
	// listed tab is always reachable, so no per-tab enable flag is needed.
	const sectionsByMode = {
		citizen: [
			{ href: '/dashboard', label: 'Overview' },
			{ href: '/dashboard/invites', label: 'Invites' },
			{ href: '/dashboard/account', label: 'Account' }
		],
		// Campaign-application flow, reached via "Launch a Campaign": no Overview, and Team
		// needs 2+ managers before the application can be submitted. Team/Documentation
		// show their own "save your profile first" prompt until a leader row exists.
		apply: [
			{ href: '/dashboard/profile', label: "Profile" },
			{ href: '/dashboard/contacts', label: 'Contacts' },
			{ href: '/dashboard/team', label: 'Team' },
			{ href: '/dashboard/documentation', label: 'Documentation' }
		],
		campaign: [
			{ href: '/dashboard/profile', label: 'Profile' },
			{ href: '/dashboard/contacts', label: 'Contacts' },
			{ href: '/dashboard/manifesto', label: 'Manifesto' },
			{ href: '/dashboard/posts', label: 'Posts' },
			{ href: '/dashboard/reviews', label: 'Reviews' },
			{ href: '/dashboard/team', label: 'Team' },
			{ href: '/dashboard/followers', label: 'Followers' },
			{ href: '/dashboard/broadcasts', label: 'Broadcasts' },
			{ href: '/dashboard/fundraising', label: 'Fundraising' },
			{ href: '/dashboard/pr', label: 'PR desk' },
			{ href: '/dashboard/competitors', label: 'Competitors' }
		],
		ambassador: [{ href: '/dashboard/ambassador', label: 'My campaigns' }],
		admin: [
			{ href: '/dashboard/admin/candidates', label: 'Candidates' },
			{ href: '/dashboard/admin/accounts', label: 'Accounts' },
			{ href: '/dashboard/admin/pillars', label: 'Pillars' },
			{ href: '/dashboard/admin/verifications', label: 'Verifications' },
			{ href: '/dashboard/admin/claims', label: 'Claims' },
			{ href: '/dashboard/admin/moderation', label: 'Moderation' },
			{ href: '/dashboard/admin/subscriptions', label: 'Subscriptions & revenue' },
			{ href: '/dashboard/admin/packages', label: 'Packages' },
			{ href: '/dashboard/admin/settings', label: 'Settings' }
		]
	};
	const sections = $derived(sectionsByMode[mode]);

	// Apply-flow tabs that still have missing required fields get a `*` on their title.
	// Maps each tab's route to its checklist key; only meaningful while `application` is
	// present (apply mode, not yet verified).
	const applyTabKeys: Record<string, keyof NonNullable<typeof data.application>> = {
		'/dashboard/profile': 'profile',
		'/dashboard/contacts': 'contacts',
		'/dashboard/team': 'team',
		'/dashboard/documentation': 'documentation'
	};
	const tabIncomplete = (href: string) => {
		const key = applyTabKeys[href];
		return !!(key && data.application && !data.application[key].complete);
	};

	// Every still-missing field across all four tabs — powers the Submit Application
	// tooltip so the user sees exactly what's outstanding, not just a disabled button.
	const missingFields = $derived(
		data.application
			? [
					...data.application.profile.missing,
					...data.application.contacts.missing,
					...data.application.team.missing,
					...data.application.documentation.missing
				]
			: []
	);

	// Exact match for any tab that's a URL-prefix of a sibling tab (e.g. Overview at
	// /dashboard vs. /dashboard/account) — otherwise both would light up.
	const isActive = (href: string) =>
		sections.some((s) => s.href !== href && s.href.startsWith(href))
			? page.url.pathname === href
			: page.url.pathname.startsWith(href);

	// The <details> dropdown doesn't auto-close on navigation since this layout
	// persists across route changes — close it explicitly when a mode is picked.
	let switcherOpen = $state(false);
	let switcherEl: HTMLDetailsElement | undefined = $state();

	// <details> has no native "close on outside click" behavior — only clicking
	// its own <summary> toggles it. Close on any click that lands outside it.
	$effect(() => {
		if (!switcherOpen) return;
		const onClick = (e: MouseEvent) => {
			if (switcherEl && !switcherEl.contains(e.target as Node)) switcherOpen = false;
		};
		document.addEventListener('click', onClick);
		return () => document.removeEventListener('click', onClick);
	});
</script>

<section class="mx-auto max-w-7xl px-4 py-8 sm:px-6">
	{#if joinedMessage}
		<div class="mb-4 rounded-xl bg-primary-soft p-4 text-sm font-medium text-on-primary">{joinedMessage}</div>
	{:else if notice}
		<div class="mb-4 rounded-xl bg-primary-soft p-4 text-sm font-medium text-on-primary">{notice}</div>
	{/if}

	<!-- Headers -->

	<div class="flex flex-wrap items-center justify-between gap-2">
		<div class="flex items-center justify-between gap-2 w-full">
			{#if mode === 'campaign' && data.leaderContext}
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
				<h1 class="text-2xl font-bold text-heading">{data.claimName ? `Claim Profile: ${data.claimName}` : 'Create a Leader Profile'}</h1>
			{:else}
				<h1 class="text-2xl font-bold text-heading">Welcome, {data.firstName}</h1>
			{/if}
			<!-- Role switcher: pick which dashboard context you're in. Each mode has its own
			tab set below, so switching genuinely changes what's available. -->
			{#if modes.length > 1}
				<details class="group relative w-fit" bind:open={switcherOpen} bind:this={switcherEl}>
					<summary
						class="flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-heading transition hover:bg-surface-2"
					>
						{currentMode.label}
						<span class="text-muted transition group-open:rotate-180 leading-none h-2">^</span>
					</summary>
					<div class="absolute right-0 z-10 mt-2 min-w-52 rounded-2xl border border-border bg-surface p-1.5 shadow-lg">
						{#each modes as m (m.key)}
							<a
								href={m.href}
								onclick={() => (switcherOpen = false)}
								class="block truncate rounded-xl px-3 py-1.5 text-sm transition hover:bg-primary hover:text-on-primary {m.key === currentMode.key
									? 'bg-surface-2 font-semibold text-heading'
									: 'text-muted'}"
							>
								{m.label}
							</a>
						{/each}
						<a
							href="/logout"
							data-sveltekit-preload-data="off"
							data-sveltekit-reload
							class="block truncate rounded-xl px-3 py-1.5 text-sm text-muted transition hover:bg-primary hover:text-on-primary"
						>
							Log out
						</a>
					</div>
				</details>
			{/if}
		</div>

		<div class="flex flex-wrap justify-between gap-2 w-full">
			<!-- Submit Application: apply mode only, gated on every tab (Profile/Contacts
			minus website+socials/Team 2+/Documentation) being filled in. -->
			{#if mode === 'apply'}
				<span class="flex items-center text-sm my-2 sm:my-0">
					{data.claimName
					? 'Confirm the details below to claim this profile.'
					: "A few steps to go public ahead of 10 August 2027."}
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
						action="/dashboard/profile?/requestVerification"
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
						<input
							type="text"
							name="nationalId"
							required
							placeholder="National ID number"
							class="w-36 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
						/>
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
						class="rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-on-primary transition bg-primary hover:bg-surface-2"
					>
						View public page
					</a>
				{:else}
					<span
						class="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1 text-sm font-semibold text-muted"
					>
						Pending verification
					</span>
				{/if}
			{:else}
				<p class="text-sm text-muted uppercase">{mode}</p>
			{/if}
			
		</div>
	</div>
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
	{/if}
	<!-- Consolidated checklist: collapsed to just its title, click to expand the
	full list of what's still outstanding across every tab. -->
	{#if data.application}
		<div class="flex items-center">
			{#if missingFields.length > 0}
				<div class="mt-3 flex gap-1.5 text-sm text-muted">
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
