<script lang="ts">
	import type { PageProps } from './$types';

	// Reaching this page at all (past the load function) means acceptance failed —
	// success redirects straight into the dashboard, no confirmation click needed.
	let { data }: PageProps = $props();
</script>

<svelte:head><title>Campaign invite — leaders.ke</title></svelte:head>

<section class="mx-auto max-w-md px-4 py-16 text-center sm:px-6">
	<h1 class="text-2xl font-bold text-heading">Invite not valid</h1>
	<p class="mt-2 text-sm text-muted">{data.error}</p>
</section>
