<script lang="ts">
	import Campaign from '$lib/components/Campaign.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const leader = $derived(data.leader);
</script>

<svelte:head>
	<title>{leader.name} — campaign preview {data.year} | leaders.ke</title>
</svelte:head>

<Campaign {data} {form} />
