<script lang="ts">
	import { enhance } from '$app/forms';
	import Pagination from '$lib/components/admin/Pagination.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const dateFmt = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
	const totalPages = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)));

	// Which claim has its reason row expanded — clicking "Reject" (pending) or
	// "Revert" (approved) opens a full-width row below to type the reason before
	// submitting. Same pattern for the "Email the leader" row; opening one closes
	// the other.
	let rejectingId = $state<number | null>(null);
	let emailingId = $state<number | null>(null);
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
	{#if form?.emailed}
		<div class="mt-4 rounded-2xl border border-border bg-primary-soft p-4 text-sm font-medium text-on-primary">
			Approve link sent to {form.sentTo}.
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
								<div class="flex flex-wrap gap-2">
									<!-- Approve submits immediately; Reject (pending) and Revert (approved)
									open the reason row below instead — same design as the verification tab. -->
									{#if claim.outcome !== 'approved'}
										<form method="post" action="?/review" use:enhance>
											<input type="hidden" name="claimId" value={claim.claimId} />
											<button
												type="submit"
												name="outcome"
												value="approved"
												class="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-on-primary transition hover:brightness-95"
											>
												Approve
											</button>
										</form>
									{/if}
									{#if claim.outcome !== 'rejected'}
										{#if rejectingId === claim.claimId}
											<button
												type="button"
												onclick={() => (rejectingId = null)}
												class="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted transition hover:bg-surface-2 hover:text-heading"
											>
												Cancel
											</button>
										{:else}
											<button
												type="button"
												onclick={() => {
													rejectingId = claim.claimId;
													emailingId = null;
												}}
												class="rounded-full border border-border px-3 py-1 text-xs font-semibold text-heading transition hover:bg-surface-2"
											>
												{claim.outcome === 'approved' ? 'Revert' : 'Reject'}
											</button>
										{/if}
									{/if}
									{#if !claim.outcome}
										{#if emailingId === claim.claimId}
											<button
												type="button"
												onclick={() => (emailingId = null)}
												class="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted transition hover:bg-surface-2 hover:text-heading"
											>
												Cancel
											</button>
										{:else}
											<button
												type="button"
												onclick={() => {
													emailingId = claim.claimId;
													rejectingId = null;
												}}
												class="rounded-full border border-border px-3 py-1 text-xs font-semibold text-heading transition hover:bg-surface-2"
											>
												Email
											</button>
										{/if}
									{/if}
								</div>
							</td>
						</tr>
						{#if claim.outcome === 'rejected' && claim.notes}
							<tr class="border-t border-border">
								<td colspan="6" class="px-4 py-2 text-sm text-muted">
									<span class="font-semibold text-heading">Rejection reason:</span>
									{claim.notes}
								</td>
							</tr>
						{/if}
						{#if claim.outcome !== 'rejected' && rejectingId === claim.claimId}
							<tr class="border-t border-border bg-surface-2">
								<td colspan="6" class="px-4 py-3">
									<form
										method="post"
										action="?/review"
										class="flex flex-wrap items-center gap-2"
										use:enhance={({ cancel }) => {
											if (
												claim.outcome === 'approved' &&
												!confirm(`Revert ${claim.claimantName}'s claim on ${claim.subjectName}'s profile? This removes their manager access immediately.`)
											) {
												cancel();
												return;
											}
											return async ({ update }) => {
												rejectingId = null;
												await update();
											};
										}}
									>
										<input type="hidden" name="claimId" value={claim.claimId} />
										<input type="hidden" name="outcome" value="rejected" />
										<input
											type="text"
											name="notes"
											placeholder="Reason for {claim.outcome === 'approved' ? 'reverting' : 'rejection'} (shown to the claimant)"
											class="min-w-72 flex-1 rounded-full border border-border bg-surface px-4 py-1.5 text-xs text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
										/>
										<button
											type="submit"
											class="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary transition hover:brightness-95"
										>
											Submit
										</button>
									</form>
								</td>
							</tr>
						{/if}
						{#if !claim.outcome && emailingId === claim.claimId}
							<!-- Sends the leader their single-use approve/reject link to an address
							the admin knows out-of-band (e.g. when no verified/sourced email is on file). -->
							<tr class="border-t border-border bg-surface-2">
								<td colspan="6" class="px-4 py-3">
									<form
										method="post"
										action="?/emailLeader"
										class="flex flex-wrap items-center gap-2"
										use:enhance={() => {
											return async ({ update }) => {
												emailingId = null;
												await update();
											};
										}}
									>
										<input type="hidden" name="claimId" value={claim.claimId} />
										<input
											type="email"
											name="email"
											required
											value={claim.leaderEmail ?? ''}
											placeholder="Leader's email address"
											class="min-w-72 flex-1 rounded-full border border-border bg-surface px-4 py-1.5 text-xs text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
										/>
										<button
											type="submit"
											class="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary transition hover:brightness-95"
										>
											Send Approval Email
										</button>
									</form>
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</div>
		<Pagination page={data.page} {totalPages} total={data.total} itemLabel="claims" href={(p) => `?page=${p}`} />
	{:else}
		<p class="mt-6 text-sm text-muted">No profile claims yet.</p>
	{/if}
</div>
