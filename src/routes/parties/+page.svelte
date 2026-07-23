<script lang="ts">
	import PartiesTable from '$lib/components/PartiesTable.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Parties — leaders.ke</title>
	<meta name="description" content="Registered political parties ahead of the 2027 General Elections." />
</svelte:head>

<section class="mx-auto max-w-7xl px-4 py-14 sm:px-6">
	<div class="max-w-2xl">
		<h1 class="text-3xl font-extrabold tracking-tight text-heading sm:text-4xl">Parties</h1>
		<p class="mt-3 text-base leading-relaxed">Registered political parties, per the ORPP register.</p>
	</div>

	<div class="mt-8">
		<PartiesTable parties={data.parties} />
	</div>
</section>
