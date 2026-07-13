<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const dateFmt = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
</script>

<svelte:head><title>Profile claims — Admin</title></svelte:head>

<div>
	<h1 class="text-xl font-bold text-heading">Profile claims</h1>
	<p class="mt-1 text-sm text-muted">
		Approving makes the claimant an admin manager of the profile; rejecting an already-approved
		claim reverts it (removes their manager access).
	</p>

	{#if form?.error}
		<div class="mt-4 rounded-2xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
			{form.error}
		</div>
	{/if}

	{#if data.claims.length > 0}
		<div class="mt-6 overflow-x-auto rounded-2xl border border-border">
			<table class="w-full min-w-180 border-collapse text-left">
				<thead>
					<tr class="bg-surface-2">
						<th class="px-4 py-3 text-sm font-semibold text-heading">Leader ID</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Profile</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Claimant</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Requested</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Outcome</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each data.claims as claim (claim.claimId)}
						<tr class="border-t border-border">
							<td class="px-4 py-3 text-sm tabular-nums text-muted">{claim.leaderId}</td>
							<td class="px-4 py-3 text-sm text-heading">{claim.subjectName}</td>
							<td class="px-4 py-3 text-sm text-muted">{claim.claimantName}</td>
							<td class="px-4 py-3 text-sm text-muted">{dateFmt.format(new Date(claim.requestedAt))}</td>
							<td class="px-4 py-3 text-sm">
								<span
									class="rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize {claim.outcome === 'approved'
										? 'bg-primary-soft text-on-primary'
										: claim.outcome === 'rejected'
											? 'bg-surface-2 text-muted'
											: 'border border-border text-muted'}"
								>
									{claim.outcome ?? 'pending'}
								</span>
							</td>
							<td class="px-4 py-3">
								<form
									method="post"
									action="?/review"
									class="flex flex-wrap gap-2"
									use:enhance={({ cancel }) => {
										if (
											claim.outcome === 'approved' &&
											!confirm(`Revert ${claim.claimantName}'s claim on ${claim.subjectName}'s profile? This removes their manager access immediately.`)
										) {
											cancel();
										}
									}}
								>
									<input type="hidden" name="claimId" value={claim.claimId} />
									{#if claim.outcome !== 'approved'}
										<button
											type="submit"
											name="outcome"
											value="approved"
											class="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-on-primary transition hover:brightness-95"
										>
											Approve
										</button>
									{/if}
									{#if claim.outcome !== 'rejected'}
										<button
											type="submit"
											name="outcome"
											value="rejected"
											class="rounded-full border border-border px-3 py-1 text-xs font-semibold text-heading transition hover:bg-surface-2"
										>
											{claim.outcome === 'approved' ? 'Revert' : 'Reject'}
										</button>
									{/if}
								</form>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<p class="mt-6 text-sm text-muted">No profile claims yet.</p>
	{/if}
</div>
