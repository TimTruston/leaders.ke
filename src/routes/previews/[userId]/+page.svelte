<script lang="ts">
	import LeaderProfile from '$lib/components/LeaderProfile.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.leader.name} — preview | leaders.ke</title>
</svelte:head>

<LeaderProfile {data} preview />
