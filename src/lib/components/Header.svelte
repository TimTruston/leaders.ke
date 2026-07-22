<script lang="ts">
	import type { User } from 'better-auth';
	import { page } from '$app/state';
	import { computeDashboardModes, type DashboardModesInput } from '$lib/utils/dashboardModes';
	import QuickSearch from './QuickSearch.svelte';
	import ThemeToggle from './ThemeToggle.svelte';

	// user is null when signed out; drives the Log in / Log out switch.
	let { user = null }: { user?: User | null } = $props();

	// While the quick search is expanded it covers the nav links' space.
	let searchOpen = $state(false);

	// Under /dashboard the layout's own load already computed myCampaigns/pendingClaims/
	// isAdmin (it's mid-request there anyway) — page.data has them for free. Everywhere
	// else (public pages, /pricing, a leader's profile…) they're absent, since running
	// that query on every page view for every signed-in visitor would tax the site's
	// highest-traffic pages just to feed a dropdown most visits never open. Lazy-fetched
	// once per page-load session instead, cached here so reopening the dropdown (or
	// navigating client-side, since Header stays mounted) never re-fetches.
	let fetchedSwitcherData = $state<DashboardModesInput | null>(null);
	let fetchingSwitcher = false;
	const hasEagerSwitcherData = $derived(page.data.myCampaigns !== undefined);
	const modes = $derived(computeDashboardModes(page.url.pathname, page.params, hasEagerSwitcherData ? page.data : (fetchedSwitcherData ?? page.data)));

	async function ensureSwitcherData() {
		if (hasEagerSwitcherData || fetchedSwitcherData || fetchingSwitcher || !user) return;
		fetchingSwitcher = true;
		try {
			const res = await fetch('/api/switcher');
			if (res.ok) fetchedSwitcherData = await res.json();
		} finally {
			fetchingSwitcher = false;
		}
	}

	// The <details> dropdown doesn't auto-close on navigation — close it
	// explicitly when a mode is picked, and on any click outside it.
	let switcherOpen = $state(false);
	let switcherEl: HTMLDetailsElement | undefined = $state();
	$effect(() => {
		if (!switcherOpen) return;
		ensureSwitcherData();
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

			{#if user}
				<!-- Account switcher: always offers Log out, even for a pure citizen with
				no other context to switch into (modes.length === 1) — only the extra
				mode entries (campaign you run/manage, a pending claim, Platform admin)
				are conditional on having more than one. -->
				<details class="group relative w-fit" bind:open={switcherOpen} bind:this={switcherEl}>
					<summary
						class="flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-heading transition hover:bg-surface-2"
					>
						{#if modes.length > 1}
							{modes.find((m) => m.current)?.label ?? modes[0].label}
						{:else}
							<span
								class="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-bold text-on-primary uppercase"
							>
								{user.name.trim().charAt(0)}
							</span>
							<span class="hidden max-w-32 truncate sm:inline">{user.name}</span>
						{/if}
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
