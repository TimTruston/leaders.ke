<script lang="ts">
	import type { User } from 'better-auth';
	import { page } from '$app/state';
	import { computeDashboardModes } from '$lib/utils/dashboardModes';
	import QuickSearch from './QuickSearch.svelte';
	import ThemeToggle from './ThemeToggle.svelte';

	// user is null when signed out; drives the Log in / Log out switch.
	let { user = null }: { user?: User | null } = $props();

	// While the quick search is expanded it covers the nav links' space.
	let searchOpen = $state(false);

	// Non-empty once the dashboard layout's data (myCampaigns/pendingClaims/isAdmin/…)
	// is in the merged page data — i.e. anywhere under /dashboard with more than one
	// context available. Empty everywhere else, where the plain name link applies.
	// Computed from page data/URL (not a client effect) so it's correct on first
	// paint, SSR included — no post-hydration flash.
	const modes = $derived(computeDashboardModes(page.url.pathname, page.params, page.data));

	// The <details> dropdown doesn't auto-close on navigation — close it
	// explicitly when a mode is picked, and on any click outside it.
	let switcherOpen = $state(false);
	let switcherEl: HTMLDetailsElement | undefined = $state();
	$effect(() => {
		if (!switcherOpen) return;
		const onClick = (e: MouseEvent) => {
			if (switcherEl && !switcherEl.contains(e.target as Node)) switcherOpen = false;
		};
		document.addEventListener('click', onClick);
		return () => document.removeEventListener('click', onClick);
	});

	// Nav only lists built pages; Positions/Issues/News return as their phases ship.
	const links = [
		{ href: '/presidents', label: 'All' },
		{ href: '/rank/presidents', label: 'Ranks' },
		{ href: '/compare', label: 'Compare' },
		{ href: '/features', label: 'Features' },
		{ href: '/pricing', label: 'Pricing' }
	];

	// Mobile nav: the desktop links are hidden below md, so a hamburger opens a stacked panel.
	let menuOpen = $state(false);
</script>

<header class="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur">
	<div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
		<a href="/" class="flex items-center gap-2 font-semibold text-heading">
			<span class="grid size-8 place-items-center rounded-lg bg-primary text-on-primary">L</span>
			<span>leaders<span class="text-primary">.ke</span></span>
		</a>

		<div class="mx-3 flex min-w-0 flex-1 items-center justify-end gap-1 md:justify-center">
			{#if !searchOpen}
				<nav class="hidden items-center gap-1 md:flex">
					{#each links as link (link.href)}
						<a
							href={link.href}
							class="rounded-md px-3 py-2 text-sm font-medium text-text transition hover:bg-surface-2 hover:text-heading"
						>
							{link.label}
						</a>
					{/each}
				</nav>
			{/if}
			<!-- Only stretch while the search is open (it then covers the nav's space, capped and
			     centered); closed, the span shrink-wraps so nav + search center as one group. -->
			<span class="hidden lg:flex {searchOpen ? 'w-full justify-center' : ''}">
				<QuickSearch bind:open={searchOpen} hotkey />
			</span>
		</div>

		<div class="flex items-center gap-2">
			<ThemeToggle />

			{#if user && modes.length > 1}
				<!-- Dashboard mode switcher: pick which context you're in (Citizen, a
				campaign you run/manage, a pending claim, Platform admin). -->
				<details class="group relative w-fit" bind:open={switcherOpen} bind:this={switcherEl}>
					<summary
						class="flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-heading transition hover:bg-surface-2"
					>
						{modes.find((m) => m.current)?.label ?? modes[0].label}
						<span class="text-muted transition group-open:rotate-180 leading-none h-2">^</span>
					</summary>
					<div class="absolute right-0 z-10 mt-2 min-w-52 rounded-2xl border border-border bg-surface p-1.5 shadow-lg">
						{#each modes as m (m.key)}
							<a
								href={m.href}
								onclick={() => (switcherOpen = false)}
								class="block truncate rounded-xl px-3 py-1.5 text-sm transition hover:bg-primary hover:text-on-primary {m.current
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
			{:else if user}
				<a
					href="/dashboard"
					class="flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm font-medium text-heading transition hover:bg-surface-2"
				>
					<span
						class="grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-bold text-on-primary uppercase"
					>
						{user.name.trim().charAt(0)}
					</span>
					<span class="hidden max-w-40 truncate sm:block">{user.name}</span>
				</a>
			{:else}
				<a
					href="/login"
					class="hidden rounded-md px-3 py-2 text-sm font-medium text-text transition hover:text-heading sm:block"
				>
					Log in
				</a>
				<a
					href="/signup"
					class="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95 focus:ring-0 focus:ring-ring focus:outline-none"
				>
					Get started
				</a>
			{/if}
			<!-- Hamburger: mobile-only trigger for the nav panel -->
			<button
				type="button"
				onclick={() => (menuOpen = !menuOpen)}
				aria-label="Toggle menu"
				aria-expanded={menuOpen}
				class="grid size-9 place-items-center rounded-md text-heading transition hover:bg-surface-2 md:hidden"
			>
				{#if menuOpen}
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-5">
						<path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" />
					</svg>
				{:else}
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-5">
						<path stroke-linecap="round" d="M4 7h16M4 12h16M4 17h16" />
					</svg>
				{/if}
			</button>
		</div>

	</div>

	<!-- Mobile nav panel -->
	{#if menuOpen}
		<nav class="border-t border-border bg-surface lg:hidden">
			<div class="mx-auto max-w-7xl space-y-1 px-4 py-3 sm:px-6">
				{#each links as link (link.href)}
					<a
						href={link.href}
						onclick={() => (menuOpen = false)}
						class="block rounded-md px-3 py-2 text-sm font-medium text-text transition hover:bg-surface-2 hover:text-heading"
					>
						{link.label}
					</a>
				{/each}
				{#if !user}
					<a
						href="/login"
						onclick={() => (menuOpen = false)}
						class="block rounded-md px-3 py-2 text-sm font-medium text-text transition hover:bg-surface-2 hover:text-heading"
					>
						Log in
					</a>
				{/if}
			</div>
		</nav>
	{/if}
	<!-- Mobile: the search gets its own full-width row under the bar (a block wrapper,
	     and expand={false} so the input is always w-full instead of shrink-until-focused). -->
	<div class="block px-4 pb-3 lg:hidden">
		<QuickSearch bind:open={searchOpen} expand={false} />
	</div>
</header>
