<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Ambassador — leaders.ke</title></svelte:head>

<div>
	<h1 class="text-xl font-bold text-heading">My campaigns</h1>
	<p class="mt-1 text-sm text-muted">Campaigns you mobilize citizens for as an ambassador.</p>

	{#if form?.error}
		<div class="mt-4 rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
			{form.error}
		</div>
	{/if}
	{#if form?.left}
		<div class="mt-4 rounded-xl bg-primary-soft p-4 text-sm font-medium text-on-primary">
			You've left that campaign.
		</div>
	{/if}

	{#if data.assignments.length > 0}
		<ul class="mt-6 space-y-3">
			{#each data.assignments as assignment (assignment.id)}
				<li class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-5">
					<div class="min-w-0">
						<a href={assignment.leaderPath} class="font-semibold text-heading hover:text-primary">
							{assignment.leaderName}
						</a>
						<p class="text-sm text-muted">{assignment.positionTitle}, {assignment.region}</p>
					</div>
					<form
						method="post"
						action="?/leave"
						use:enhance={({ cancel }) => {
							if (!confirm(`Leave ${assignment.leaderName}'s campaign?`)) cancel();
						}}
					>
						<input type="hidden" name="ambassadorId" value={assignment.id} />
						<button
							type="submit"
							class="shrink-0 rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-muted transition hover:bg-surface-2 hover:text-heading"
						>
							Leave
						</button>
					</form>
				</li>
			{/each}
		</ul>
	{:else}
		<div class="mt-6 rounded-2xl border border-dashed border-border p-8 text-center">
			<p class="font-semibold text-heading">Not mobilizing for anyone yet</p>
			<p class="mx-auto mt-2 max-w-md text-sm text-muted">
				Ask a campaign for an invite link, or find a leader's page and see if they're recruiting
				ambassadors.
			</p>
		</div>
	{/if}
</div>
