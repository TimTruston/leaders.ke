<script lang="ts">
	import LeaderProfile from '$lib/components/LeaderProfile.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.leader.name} — {data.leader.positionTitle}, {data.leader.regionLabel} | leaders.ke</title>
	<meta
		name="description"
		content="{data.leader.name}, {data.leader.status} {data.leader.positionTitle} for {data.leader.regionLabel}: verified record, track record and active campaign."
	/>
</svelte:head>

<LeaderProfile {data} {form} />
