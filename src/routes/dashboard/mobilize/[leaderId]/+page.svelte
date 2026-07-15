<script lang="ts">
	import { enhance } from '$app/forms';
	import FollowersTable from '$lib/components/FollowersTable.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Ambassador: {data.assignment.leaderName} — leaders.ke</title></svelte:head>

<div>
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="text-lg font-semibold text-heading">
				Citizens you added <span class="text-sm font-normal text-muted">({data.total})</span>
			</h2>
			<p class="mt-1 text-sm text-muted">
				Citizens you've recruited for
				<a href={data.assignment.leaderPath} class="font-medium text-heading hover:text-primary">
					{data.assignment.positionTitle} {data.assignment.leaderName}, {data.assignment.region}
				</a>
			</p>
		</div>
		<form
			method="post"
			action="?/leave"
			use:enhance={({ cancel }) => {
				if (!confirm(`Leave ${data.assignment.leaderName}'s campaign?`)) cancel();
			}}
		>
			<input type="hidden" name="ambassadorId" value={data.assignment.id} />
			<button
				type="submit"
				class="shrink-0 rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-muted transition hover:bg-surface-2 hover:text-heading"
			>
				Leave campaign
			</button>
		</form>
	</div>

	{#if form?.error}
		<div class="mt-4 rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
			{form.error}
		</div>
	{:else if form?.added}
		<div class="mt-4 rounded-xl bg-primary-soft p-4 text-sm font-medium text-on-primary">
			{form.added.name} now follows this campaign.
		</div>
	{/if}

	<div class="mt-6">
		<FollowersTable
			followers={data.recruits}
			total={data.total}
			page={data.page}
			pageSize={data.pageSize}
			pagerHref={(p) => `?page=${p}`}
			leaderId={data.assignment.leaderId}
			county={data.assignment.region}
		/>
	</div>
</div>
