<script lang="ts">
	import type { User } from 'better-auth';
	import { enhance } from '$app/forms';
	import ThemeToggle from './ThemeToggle.svelte';

	// user is null when signed out; drives the Log in / Log out switch.
	let { user = null }: { user?: User | null } = $props();

	// Nav only lists built pages; Positions/Issues/News return as their phases ship.
	const links = [
		{ href: '/leaders', label: 'Leaders' },
		{ href: '/ranks', label: 'Ranks' },
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

		<div class="flex items-center gap-2">
			<ThemeToggle />

			{#if user}
				<a
					href="/dashboard/citizen"
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
					class="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95 focus:ring-2 focus:ring-ring focus:outline-none"
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
		<nav class="border-t border-border bg-surface md:hidden">
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
</header>
