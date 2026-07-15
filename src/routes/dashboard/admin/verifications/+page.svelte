<script lang="ts">
	import { enhance } from '$app/forms';
	import Pagination from '$lib/components/admin/Pagination.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const dateFmt = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
	const totalPages = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)));

	// Which pending request has its reason row expanded — clicking "Reject" opens a
	// full-width row below it to type the reason before actually submitting.
	let rejectingId = $state<number | null>(null);
</script>

<svelte:head>
	<title>Verifications — Admin</title>
</svelte:head>

<div>
	<h1 class="text-xl font-bold text-heading">Verifications</h1>
	<p class="mt-1 text-sm text-muted">
		Approve or reject each request. Rejecting an already-approved one reverts it: the profile
		goes back off the public pages immediately.
	</p>

	{#if form?.error}
		<div class="mt-4 rounded-2xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
			{form.error}
		</div>
	{/if}

	{#if data.requests.length > 0}
		<div class="mt-6 overflow-x-auto rounded-2xl border border-border">
			<table class="w-full min-w-220 border-collapse text-left">
				<thead>
					<tr class="bg-surface-2">
						<th class="px-4 py-3 text-sm font-semibold text-heading">Leader ID</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">User ID</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Name</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Slug</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Requested</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Verified at</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Outcome</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each data.requests as req (req.verificationId)}
						<tr class="border-t border-border">
							<td class="px-4 py-3 text-sm tabular-nums text-muted">{req.leaderId}</td>
							<td class="px-4 py-3 text-sm tabular-nums text-muted">{req.userId}</td>
							<td class="px-4 py-3 text-sm text-heading">{req.firstName} {req.otherNames}</td>
							<td class="px-4 py-3 text-sm text-muted">{req.slug ?? '—'}</td>
							<td class="px-4 py-3 text-sm text-muted">{dateFmt.format(new Date(req.requestedAt))}</td>
							<td class="px-4 py-3 text-sm text-muted">
								{req.verifiedAt ? dateFmt.format(new Date(req.verifiedAt)) : '—'}
							</td>
							<td class="px-4 py-3 text-sm">
								<span
									class="rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize {req.outcome === 'approved'
										? 'bg-primary-soft text-on-primary'
										: req.outcome === 'rejected'
											? 'bg-surface-2 text-muted'
											: 'border border-border text-muted'}"
								>
									{req.outcome ?? 'pending'}
								</span>
							</td>
							<td class="px-4 py-3">
								<div class="flex flex-wrap gap-2">
									<!-- Approve, and Revert (reject an already-approved one) submit immediately;
									a fresh Reject opens the reason row below instead. -->
									<form
										method="post"
										action="?/review"
										use:enhance={({ cancel }) => {
											if (
												req.outcome === 'approved' &&
												!confirm(`Revert ${req.firstName} ${req.otherNames}'s verification? Their profile goes back off the public pages immediately.`)
											) {
												cancel();
											}
										}}
									>
										<input type="hidden" name="verificationId" value={req.verificationId} />
										{#if req.outcome !== 'approved'}
											<button
												type="submit"
												name="outcome"
												value="approved"
												class="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-on-primary transition hover:brightness-95"
											>
												Approve
											</button>
										{:else}
											<button
												type="submit"
												name="outcome"
												value="rejected"
												class="rounded-full border border-border px-3 py-1 text-xs font-semibold text-heading transition hover:bg-surface-2"
											>
												Revert
											</button>
										{/if}
									</form>
									{#if !req.outcome}
										{#if rejectingId === req.verificationId}
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
												onclick={() => (rejectingId = req.verificationId)}
												class="rounded-full border border-border px-3 py-1 text-xs font-semibold text-heading transition hover:bg-surface-2"
											>
												Reject
											</button>
										{/if}
									{/if}
								</div>
							</td>
						</tr>
						{#if req.outcome === 'rejected' && req.notes}
							<tr class="border-t border-border">
								<td colspan="8" class="px-4 py-2 text-sm text-muted">
									<span class="font-semibold text-heading">Rejection reason:</span>
									{req.notes}
								</td>
							</tr>
						{/if}
						{#if !req.outcome && rejectingId === req.verificationId}
							<tr class="border-t border-border bg-surface-2">
								<td colspan="8" class="px-4 py-3">
									<form
										method="post"
										action="?/review"
										class="flex flex-wrap items-center gap-2"
										use:enhance={() => {
											return async ({ update }) => {
												rejectingId = null;
												await update();
											};
										}}
									>
										<input type="hidden" name="verificationId" value={req.verificationId} />
										<input type="hidden" name="outcome" value="rejected" />
										<input
											type="text"
											name="notes"
											placeholder="Reason for rejection (shown to the applicant)"
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
					{/each}
				</tbody>
			</table>
		</div>
		<Pagination page={data.page} {totalPages} total={data.total} itemLabel="requests" href={(p) => `?page=${p}`} />
	{:else}
		<p class="mt-6 text-sm text-muted">No verification requests yet.</p>
	{/if}
</div>
