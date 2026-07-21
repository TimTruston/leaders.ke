<script lang="ts">
	import { enhance } from '$app/forms';
	import CampaignTab from '$lib/components/application/CampaignTab.svelte';
	let { data, form }: { data: any; form: any } = $props();
</script>

<CampaignTab {data} {form} />

<!-- Platform-admin verification decision (moved here from the old admin verifications
table): approve mints the slug + sets the run live; the slug is prefilled and editable. -->
{#if data.verificationDecision}
	<div class="mt-8 rounded-2xl border border-border bg-surface-2 p-4">
		<h3 class="text-sm font-semibold text-heading">Verification decision</h3>
		<p class="mt-1 text-xs text-muted">Approving sets the public URL below and takes the run live.</p>
		{#if form?.verificationReviewed}
			<p class="mt-2 text-sm font-medium text-primary">Decision recorded.</p>
		{/if}
		<form method="post" action="?/reviewVerification" class="mt-3 flex flex-wrap items-center gap-2" use:enhance>
			<input type="hidden" name="verificationId" value={data.verificationDecision.verificationId} />
			<span class="text-xs text-muted">leaders.ke/</span>
			<input
				type="text"
				name="slug"
				value={data.verificationDecision.suggestedSlug}
				placeholder="enter-a-slug"
				class="min-w-56 rounded-full border border-border bg-surface px-3 py-1 text-xs text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
			/>
			<button type="submit" name="outcome" value="approved" class="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-on-primary transition hover:brightness-95">Approve</button>
			<input
				type="text"
				name="notes"
				placeholder="Reason for rejection (shown to the applicant)"
				class="min-w-56 flex-1 rounded-full border border-border bg-surface px-3 py-1 text-xs text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
			/>
			<button type="submit" name="outcome" value="rejected" class="rounded-full border border-border px-3 py-1 text-xs font-semibold text-heading transition hover:bg-surface">Reject</button>
		</form>
	</div>
{/if}
