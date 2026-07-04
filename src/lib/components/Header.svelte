<script lang="ts">
	import type { User } from 'better-auth';
	import { enhance } from '$app/forms';
	import ThemeToggle from './ThemeToggle.svelte';

	// user is null when signed out; drives the Log in / Log out switch.
	let { user = null }: { user?: User | null } = $props();

	const links = [
		{ href: '/leaders', label: 'Leaders' },
		{ href: '/positions', label: 'Positions' },
		{ href: '/issues', label: 'Issues' },
		{ href: '/news', label: 'News' }
	];
</script>

<header class="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur">
	<div class="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
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
				<form method="post" action="/logout" use:enhance>
					<button
						type="submit"
						class="rounded-full border border-border px-4 py-2 text-sm font-semibold text-heading transition hover:bg-surface-2 focus:ring-2 focus:ring-ring focus:outline-none"
					>
						Log out
					</button>
				</form>
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
		</div>
	</div>
</header>
