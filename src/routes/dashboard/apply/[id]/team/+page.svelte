<script lang="ts">
	import { enhance } from '$app/forms';
	import TeamTab from '$lib/components/application/TeamTab.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<TeamTab {data} {form} />

<!-- Platform-admin claim decision (moved here from the old admin claims table): approve
grants the claimant manager access, reject records a reason shown to them. -->
{#if data.isAdmin && data.pendingClaim}
	<div class="mt-8 rounded-2xl border border-border bg-surface-2 p-4">
		<h3 class="text-sm font-semibold text-heading">
			Claim by {data.pendingClaim.claimantName}
		</h3>
		<p class="mt-1 text-xs text-muted">Approving makes them an admin manager of this profile.</p>
		{#if form?.claimReviewed}
			<p class="mt-2 text-sm font-medium text-primary">Decision recorded.</p>
		{/if}
		<form method="post" action="?/reviewClaim" class="mt-3 flex flex-wrap items-center gap-2" use:enhance>
			<input type="hidden" name="claimId" value={data.pendingClaim.id} />
			<button type="submit" name="outcome" value="approved" class="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-on-primary transition hover:brightness-95">Approve</button>
			<input
				type="text"
				name="notes"
				placeholder="Reason for rejection (shown to the claimant)"
				class="min-w-64 flex-1 rounded-full border border-border bg-surface px-3 py-1 text-xs text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
			/>
			<button type="submit" name="outcome" value="rejected" class="rounded-full border border-border px-3 py-1 text-xs font-semibold text-heading transition hover:bg-surface">Reject</button>
		</form>
	</div>
{/if}
