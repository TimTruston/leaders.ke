<script lang="ts">
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// Section nav: Profile is always reachable (it's the onboarding step);
	// the rest need a leader profile and appear once one exists.
	const sections = $derived([
		{ href: '/dashboard', label: 'Overview', enabled: true },
		{ href: '/dashboard/profile', label: 'Profile', enabled: true },
		{ href: '/dashboard/manifesto', label: 'Manifesto', enabled: !!data.leaderContext },
		{ href: '/dashboard/posts', label: 'Posts', enabled: !!data.leaderContext },
		{ href: '/dashboard/team', label: 'Team', enabled: !!data.leaderContext },
		{ href: '/dashboard/followers', label: 'Followers', enabled: !!data.leaderContext },
		{ href: '/dashboard/broadcasts', label: 'Broadcasts', enabled: !!data.leaderContext },
		{ href: '/dashboard/endorsements', label: 'Endorsements', enabled: !!data.leaderContext },
		{ href: '/dashboard/fundraising', label: 'Fundraising', enabled: !!data.leaderContext },
		{ href: '/dashboard/pr', label: 'PR desk', enabled: !!data.leaderContext },
		{ href: '/dashboard/competitors', label: 'Competitors', enabled: !!data.leaderContext }
	]);

	const isActive = (href: string) =>
		href === '/dashboard' ? page.url.pathname === href : page.url.pathname.startsWith(href);
</script>

<section class="mx-auto max-w-7xl px-4 py-8 sm:px-6">
	<!-- Campaign header: whose campaign this dashboard drives -->
	<div class="flex flex-wrap items-center justify-between gap-3">
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

	<!-- Section nav: scrolls horizontally on phones -->
	<nav class="mt-6 overflow-x-auto border-b border-border" aria-label="Dashboard sections">
		<div class="flex w-max gap-1">
			{#each sections as section (section.href)}
				{#if section.enabled}
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
				{/if}
			{/each}
		</div>
	</nav>

	<div class="mt-8">
		{@render children()}
	</div>
</section>
