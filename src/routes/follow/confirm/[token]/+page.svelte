<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Confirm follow — leaders.ke</title></svelte:head>

<section class="mx-auto max-w-md px-4 py-20 text-center">
	{#if data.status === 'confirmed'}
		<h1 class="text-2xl font-bold text-heading">You're confirmed{data.name ? `, ${data.name}` : ''}!</h1>
		<p class="mt-2 text-sm text-muted">You'll now get this campaign's updates.</p>
	{:else}
		<h1 class="text-2xl font-bold text-heading">Link not found</h1>
		<p class="mt-2 text-sm text-muted">This confirmation link isn't valid.</p>
	{/if}
	<a
		href="/"
		class="mt-6 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition hover:brightness-95"
	>
		Back to leaders.ke
	</a>
</section>
