<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import Header from '$lib/components/Header.svelte';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="flex min-h-screen flex-col bg-surface">
	<Header />
	<main class="flex-1">
		{@render children()}
	</main>
	<footer class="border-t border-border bg-surface-2">
		<div
			class="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-muted sm:flex-row sm:px-6"
		>
			<p>© {new Date().getFullYear()} leaders.ke - Neutral civic information directory</p>
			<p>Adhering to IEBC regulations & the Data Protection Act (2019)</p>
		</div>
	</footer>
</div>
