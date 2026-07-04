<script lang="ts">
	import ThemeToggle from './ThemeToggle.svelte';

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
			<a
				href="/signup"
				class="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95 focus:ring-2 focus:ring-ring focus:outline-none"
			>
				Get started
			</a>
		</div>
	</div>
</header>
