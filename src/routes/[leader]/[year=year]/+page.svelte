<script lang="ts">
	import Campaign from '$lib/components/Campaign.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const leader = $derived(data.leader);
</script>

<svelte:head>
	<title>{leader.name} for {leader.positionTitle} {data.year}, {leader.regionLabel} | leaders.ke</title>
	<meta
		name="description"
		content="{leader.name}'s {data.year} campaign for {leader.positionTitle} of {leader.regionLabel}: manifesto, delivery tracker, citizen reviews, fundraising and updates."
	/>
</svelte:head>

<Campaign {data} {form} />
