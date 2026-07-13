<script lang="ts">
	import { setContext } from 'svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// Child pages (Profile/Contacts) call this after a successful autosave so the
	// "Changes saved" indicator up here shows, regardless of which tab triggered it.
	let savedVisible = $state(false);
	let savedTimeout: ReturnType<typeof setTimeout> | undefined;
	setContext('markSaved', () => {
		savedVisible = true;
		clearTimeout(savedTimeout);
		savedTimeout = setTimeout(() => (savedVisible = false), 2000);
	});

	let submittingApplication = $state(false);
	let applicationError = $state('');

	// Unverified-email nudge: shown on every dashboard page/mode, not just citizen —
	// an invited manager/ambassador who just accepted needs this too. A resend link
	// only makes sense once the last email is old enough that it's reasonable to
	// assume it didn't arrive; ticks locally so the countdown counts down live.
	const RESEND_COOLDOWN_MS = 10 * 60 * 1000;
	let sentAt = $state(data.verificationEmailSentAt ? new Date(data.verificationEmailSentAt).getTime() : null);
	let now = $state(Date.now());
	$effect(() => {
		const interval = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(interval);
	});
	const minsRemaining = $derived(
		sentAt !== null ? Math.max(0, Math.ceil((sentAt + RESEND_COOLDOWN_MS - now) / 60_000)) : 0
	);
	let resendError = $state('');

	// Which mode the current URL/state belongs to. The section nav below shows only
	// this mode's tabs, so switching modes actually changes what's available — not
	// just which tab is open. Profile/Contacts/Team/Documentation are shared routes
	// between "applying" and "an established campaign" — not yet verified (or no
	// profile at all) means still applying, derived from data so it's correct on
	// every load/refresh regardless of which of those shared routes you're on.
	const mode = $derived.by(() => {
		const p = page.url.pathname;
		if (p.startsWith('/dashboard/admin')) return 'admin';
		if (p.startsWith('/dashboard/ambassador')) return 'ambassador';
		if (p.startsWith('/dashboard/citizen')) return 'citizen';
		return data.leaderContext?.verified ? 'campaign' : 'apply';
	});

	// The modes this account can switch between right now. 
	const modes = $derived(
		[
			{
				key: 'campaign',
				href: '/dashboard',
				label: data.leaderContext?.role === 'manager'
					? `Managing ${data.leaderContext.leaderName}`
					: (data.leaderContext?.leaderName ?? ''),
				available: !!data.leaderContext
			},
			{ key: 'citizen', href: '/dashboard/citizen', label: 'Citizen', available: true },
			{ key: 'ambassador', href: '/dashboard/ambassador', label: 'Ambassador', available: data.isAmbassador },
			{ key: 'admin', href: '/dashboard/admin/verifications', label: 'Platform admin', available: data.isAdmin }
		].filter((m) => m.available)
	);
	const currentMode = $derived(modes.find((m) => m.key === mode) ?? modes[0]);

	// Tabs per mode. Only pages that actually exist are listed (no dead links).
	const sectionsByMode = $derived({
		campaign: [
			{ href: '/dashboard', label: 'Overview', enabled: true },
			{ href: '/dashboard/profile', label: 'Profile', enabled: true },
			{ href: '/dashboard/contacts', label: 'Contacts', enabled: !!data.leaderContext },
			{ href: '/dashboard/manifesto', label: 'Manifesto', enabled: !!data.leaderContext },
			{ href: '/dashboard/posts', label: 'Posts', enabled: !!data.leaderContext },
			{ href: '/dashboard/reviews', label: 'Reviews', enabled: !!data.leaderContext },
			{ href: '/dashboard/team', label: 'Team', enabled: !!data.leaderContext },
			{ href: '/dashboard/followers', label: 'Followers', enabled: !!data.leaderContext },
			{ href: '/dashboard/broadcasts', label: 'Broadcasts', enabled: !!data.leaderContext },
			{ href: '/dashboard/fundraising', label: 'Fundraising', enabled: !!data.leaderContext },
			{ href: '/dashboard/pr', label: 'PR desk', enabled: !!data.leaderContext },
			{ href: '/dashboard/competitors', label: 'Competitors', enabled: !!data.leaderContext }
		],
		citizen: [
			{ href: '/dashboard/citizen', label: 'Overview', enabled: true },
			{ href: '/dashboard/citizen/invites', label: 'Invites', enabled: true },
			{ href: '/dashboard/citizen/account', label: 'Account', enabled: true }
		],
		ambassador: [{ href: '/dashboard/ambassador', label: 'My campaigns', enabled: true }],
		admin: [
			{ href: '/dashboard/admin/candidates', label: 'Candidates', enabled: true },
			{ href: '/dashboard/admin/accounts', label: 'Accounts', enabled: true },
			{ href: '/dashboard/admin/pillars', label: 'Pillars', enabled: true },
			{ href: '/dashboard/admin/verifications', label: 'Verifications', enabled: true },
			{ href: '/dashboard/admin/claims', label: 'Claims', enabled: true },
			{ href: '/dashboard/admin/moderation', label: 'Moderation', enabled: true },
			{ href: '/dashboard/admin/subscriptions', label: 'Subscriptions & revenue', enabled: true },
			{ href: '/dashboard/admin/packages', label: 'Packages', enabled: true }
		],
		// Campaign-application flow, reached via "Launch a Campaign" — no Overview,
		// Team requires 2+ managers before the application can be submitted.
		// All four reachable from the start — Team/Documentation show a "save your
		// profile first" prompt of their own until a leader row exists.
		apply: [
			{ href: '/dashboard/profile', label: "Leader's Profile", enabled: true },
			{ href: '/dashboard/contacts', label: 'Contacts', enabled: true },
			{ href: '/dashboard/team', label: 'Team', enabled: true },
			{ href: '/dashboard/documentation', label: 'Documentation', enabled: true }
		]
	});
	const sections = $derived(sectionsByMode[mode].filter((s) => s.enabled));

	// Exact match for any tab that's a URL-prefix of a sibling tab (e.g. Overview at
	// /dashboard/citizen vs. /dashboard/citizen/account) — otherwise both would light up.
	const isActive = (href: string) =>
		sections.some((s) => s.href !== href && s.href.startsWith(href))
			? page.url.pathname === href
			: page.url.pathname.startsWith(href);

	// The <details> dropdown doesn't auto-close on navigation since this layout
	// persists across route changes — close it explicitly when a mode is picked.
	let switcherOpen = $state(false);
</script>

<section class="mx-auto max-w-7xl px-4 py-8 sm:px-6">
	<!-- Headers -->

	<div class="flex flex-wrap items-center justify-between gap-2">
		<div class="flex items-center justify-between gap-2 w-full">
			{#if mode === 'campaign' && data.leaderContext}
				<h1 class="text-2xl font-bold text-heading">
					{#if data.leaderContext.role === 'manager'}
						<span
							class="ml-1 align-middle rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-muted"
						>
							Managing
						</span>
					{/if}
					{data.leaderContext.leaderName}
				</h1>
			{:else if mode === 'apply'}
				<h1 class="text-2xl font-bold text-heading">Get your campaign live</h1>
			{:else}
				<h1 class="text-2xl font-bold text-heading">Welcome, {data.firstName}</h1>
			{/if}
			<!-- Role switcher: pick which dashboard context you're in. Each mode has its own
			tab set below, so switching genuinely changes what's available. -->
			{#if modes.length > 1}
				<details class="group relative w-fit" bind:open={switcherOpen}>
					<summary
						class="flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-heading transition hover:bg-surface-2"
					>
						{currentMode.label}
						<span class="text-muted transition group-open:rotate-180">⌄</span>
					</summary>
					<div class="absolute z-10 mt-2 min-w-52 rounded-2xl border border-border bg-surface p-1.5 shadow-lg">
						{#each modes as m (m.key)}
							<a
								href={m.href}
								onclick={() => (switcherOpen = false)}
								class="block truncate rounded-xl px-3 py-2 text-sm transition hover:bg-surface-2 {m.key === currentMode.key
									? 'bg-surface-2 font-semibold text-heading'
									: 'text-muted'}"
							>
								{m.label}
							</a>
						{/each}
					</div>
				</details>
			{/if}
			{#if mode === 'campaign'}
				{#if data.leaderContext}
					{#if data.leaderContext.verified}
						<a
							href={data.leaderContext.publicPath}
							class="rounded-full border border-border px-4 py-1.5 text-sm font-semibold text-heading transition hover:bg-surface-2"
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
				{/if}
			{/if}
		</div>

		<div class="flex flex-wrap justify-between gap-2 w-full">
			{#if mode === 'campaign' && data.leaderContext}
				
				<p class="text-sm text-muted">
					{data.leaderContext.positionTitle}, {data.leaderContext.region}
					· <span class="capitalize">{data.leaderContext.status}</span>
				</p>
			{:else if mode === 'apply'}
				<p class="text-sm text-muted">A few steps to a public leader page ahead of 10 August 2027.</p>
			{:else}
				<p class="text-sm text-muted uppercase">{mode}</p>
			{/if}
			<!-- Submit Application: apply mode only, gated on every tab (Profile/Contacts
			minus website+socials/Team 2+/Documentation) being filled in. -->
			{#if mode === 'apply' && data.leaderContext}
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
						class="flex items-center gap-2"
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
						<!-- Autosave feedback: any tab in this layout can trigger it via the "markSaved" context. -->
						{#if savedVisible}
							<span class="text-xs font-medium text-muted">Changes saved</span>
						{/if}

						<input
							type="text"
							name="nationalId"
							required
							placeholder="National ID number"
							class="w-36 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-heading placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
						/>
						<button
							type="submit"
							disabled={!data.applicationComplete || submittingApplication}
							title={data.applicationComplete ? '' : 'Fill in every tab (Profile, Contacts, Team, Documentation) first'}
							class="shrink-0 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{submittingApplication ? 'Submitting…' : 'Submit Application'}
						</button>
					</form>
				{/if}
			{/if}
		</div>

	</div>
	{#if mode === 'apply' && applicationError}
		<p class="text-right text-xs text-red-500">{applicationError}</p>
	{/if}

	<!-- Section nav: only when the mode has more than one tab. -->
	{#if sections.length > 1}
		<nav class="mt-4 overflow-x-auto border-b border-border" aria-label="Dashboard sections">
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
						{section.label}
					</a>
				{/each}
			</div>
		</nav>
	{/if}

	<div class="mt-8">
		{@render children()}
	</div>

	{#if !data.emailVerified}
		<div class="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-primary-soft p-4 text-sm font-medium text-on-primary">
			<span>Check your inbox at {data.email} to verify your email.</span>
			{#if minsRemaining > 0}
				<span class="shrink-0 text-on-primary/70">Resend after {minsRemaining} mins</span>
			{:else}
				<form
					method="post"
					action="/dashboard/citizen?/resend"
					use:enhance={() => {
						resendError = '';
						return async ({ result, update }) => {
							if (result.type === 'success') sentAt = Date.now();
							else if (result.type === 'failure') resendError = (result.data?.error as string) ?? 'Could not resend.';
							await update();
						};
					}}
				>
					<button type="submit" class="shrink-0 font-semibold underline hover:no-underline">Resend</button>
				</form>
			{/if}
		</div>
		{#if resendError}
			<p class="-mt-2 mb-4 text-sm text-red-500">{resendError}</p>
		{/if}
	{/if}

</section>
