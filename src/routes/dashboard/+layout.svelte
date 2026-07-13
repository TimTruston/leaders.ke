<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

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

	// Which mode the current URL belongs to. The section nav below shows only this
	// mode's tabs, so switching modes actually changes what's available — not just
	// which tab is open.
	const mode = $derived.by(() => {
		const p = page.url.pathname;
		if (p.startsWith('/dashboard/admin')) return 'admin';
		if (p.startsWith('/dashboard/ambassador')) return 'ambassador';
		if (p.startsWith('/dashboard/citizen')) return 'citizen';
		return 'campaign';
	});

	// The modes this account can switch between right now. Campaign is always
	// present: either you run one, or the entry is "Launch a campaign".
	const modes = $derived(
		[
			{
				key: 'campaign',
				href: '/dashboard',
				label: data.leaderContext
					? data.leaderContext.role === 'manager'
						? `Managing ${data.leaderContext.leaderName}`
						: data.leaderContext.leaderName
					: 'Launch a campaign',
				available: true
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
		citizen: [{ href: '/dashboard/citizen', label: 'My leaders.ke', enabled: true }],
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
		]
	});
	const sections = $derived(sectionsByMode[mode].filter((s) => s.enabled));

	const isActive = (href: string) =>
		href === '/dashboard' ? page.url.pathname === href : page.url.pathname.startsWith(href);

	// The <details> dropdown doesn't auto-close on navigation since this layout
	// persists across route changes — close it explicitly when a mode is picked.
	let switcherOpen = $state(false);
</script>

<section class="mx-auto max-w-7xl px-4 py-8 sm:px-6">
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

	<!-- Campaign identity header: only in campaign mode; other modes' pages own their headers. -->
	{#if mode === 'campaign'}
		<div class="mt-4 flex flex-wrap items-center justify-between gap-3">
			<div>
				{#if data.leaderContext}
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
					<p class="mt-1 text-sm text-muted">
						{data.leaderContext.positionTitle}, {data.leaderContext.region}
						· <span class="capitalize">{data.leaderContext.status}</span>
					</p>
				{:else}
					<h1 class="text-2xl font-bold text-heading">Welcome, {data.firstName}</h1>
					<p class="mt-1 text-sm text-muted">Set up your leader profile to unlock the campaign HQ.</p>
				{/if}
			</div>

			<div class="flex items-center gap-2">
				{#if data.leaderContext}
					{#if data.leaderContext.verified}
						<span
							class="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-sm font-semibold text-on-primary"
						>
							✓ Verified
						</span>
					{:else}
						<span
							class="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1 text-sm font-semibold text-muted"
						>
							Pending verification
						</span>
					{/if}
					<a
						href={data.leaderContext.publicPath}
						class="rounded-full border border-border px-4 py-1.5 text-sm font-semibold text-heading transition hover:bg-surface-2"
					>
						View public page
					</a>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Section nav: only when the mode has more than one tab. -->
	{#if sections.length > 1}
		<nav class="mt-6 overflow-x-auto border-b border-border" aria-label="Dashboard sections">
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
