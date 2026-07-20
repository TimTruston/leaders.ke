<script lang="ts">
	import LeaderProfile from '$lib/components/LeaderProfile.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const p = $derived(data.preview);
</script>

<svelte:head>
	<title>{p.data.leader.name} — claim preview | leaders.ke</title>
</svelte:head>

<div class="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
	<div class="rounded-2xl border border-primary bg-primary-soft px-4 py-3 text-sm font-medium text-on-primary">
		Claim preview: How this profile will look after <strong>{p.claimantName}</strong>'s staged changes.
	</div>
</div>

<LeaderProfile data={p.data} preview />
