<script lang="ts">
	import PartiesTable from '$lib/components/PartiesTable.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Parties — Admin — leaders.ke</title></svelte:head>

<h1 class="text-lg font-semibold text-heading">Parties</h1>
<p class="mt-1 text-sm text-muted">
	Verify a party once its name, symbol, colors and status have been checked against the ORPP register.
</p>

<div class="mt-6">
	<PartiesTable parties={data.parties} showActions error={form?.error} />
</div>
