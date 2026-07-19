<script lang="ts">
	import { enhance } from '$app/forms';
	import Pagination from '$lib/components/admin/Pagination.svelte';
	import { seatPath } from '$lib/utils/seat';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const dateFmt = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
	const totalPages = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)));

	// Which request has its reason row expanded — clicking "Reject" (pending) or
	// "Revert" (approved) opens a full-width row below it to type the reason
	// before actually submitting.
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
						<th class="px-4 py-3 text-sm font-semibold text-heading">Cmpn</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">User</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Name</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Position</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Region</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Requested</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Verified at</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Outcome</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each data.requests as req (req.verificationId)}
						<tr class="border-t border-border">
							<td class="px-4 py-3 text-sm tabular-nums text-muted">{req.campaignId}</td>
							<td class="px-4 py-3 text-sm tabular-nums text-muted">{req.userId}</td>
							<td class="px-4 py-3 text-xs flex flex-col">
								<!-- The full submission (profile, contacts, docs, signoff, history) lives
								on the request's detail page. -->
								<a href="/verifications/{req.verificationId}" class="font-medium text-primary hover:underline">
									{req.firstName}
									{req.otherNames}
								</a>
								{#if req.slug}
									<!-- Admins bypass the unverified-404 on the public record page. -->
									<a href="/{req.slug}" target="_blank" rel="noopener" class="hover:text-primary hover:underline">{req.slug}</a>
								{:else}
									—
								{/if}
							</td>
							<td class="px-4 py-3 text-xs text-muted">{req.positionTitle}</td>
							<td class="px-4 py-3 text-xs text-muted">
								{#if seatPath(req.positionTitle, req.region)}
									<a href={seatPath(req.positionTitle, req.region)} target="_blank" rel="noopener" class="hover:text-primary hover:underline">
										{req.region}
									</a>
								{:else}
									{req.region}
								{/if}
							</td>
							
							<td class="px-4 py-3 text-xs text-muted">{dateFmt.format(new Date(req.requestedAt))}</td>
							<td class="px-4 py-3 text-xs text-muted">
								{req.verifiedAt ? dateFmt.format(new Date(req.verifiedAt)) : '—'}
							</td>
							<td class="px-4 py-3 text-xs">
								<span
									class="rounded-full px-2 py-0.5 text-xs capitalize {req.outcome === 'approved'
										? 'bg-primary-soft text-on-primary'
										: req.outcome === 'rejected'
											? 'bg-surface-2 text-muted'
											: 'border border-border text-muted'}"
								>
									{req.outcome ?? 'pending'}
								</span>
							</td>
							<td class="px-4 py-3 text-xs">
								<div class="flex flex-wrap gap-2">
									<!-- The profile as it would look once verified (LeaderProfile preview),
									plus the same decision controls as here. -->
									<a
										href="/verifications/{req.verificationId}"
										class="rounded-full border border-border px-2 py-0.5 text-xs text-heading transition hover:bg-surface-2"
									>
										Preview
									</a>
									<!-- Approve submits immediately; Reject (pending) and Revert (approved)
									both open the reason row below instead. -->
									{#if req.outcome !== 'approved'}
										<form method="post" action="?/review" use:enhance>
											<input type="hidden" name="verificationId" value={req.verificationId} />
											<button
												type="submit"
												name="outcome"
												value="approved"
												class="rounded-full bg-primary px-2 py-0.5 text-xs text-on-primary transition hover:brightness-95"
											>
												Approve
											</button>
										</form>
									{/if}
									{#if req.outcome !== 'rejected'}
										{#if rejectingId === req.verificationId}
											<button
												type="button"
												onclick={() => (rejectingId = null)}
												class="rounded-full border border-border px-2 py-0.5 text-xs text-muted transition hover:bg-surface-2 hover:text-heading"
											>
												Cancel
											</button>
										{:else}
											<button
												type="button"
												onclick={() => (rejectingId = req.verificationId)}
												class="rounded-full border border-border px-2 py-0.5 text-xs text-heading transition hover:bg-surface-2"
											>
												{req.outcome === 'approved' ? 'Revert' : 'Reject'}
											</button>
										{/if}
									{/if}
								</div>
							</td>
						</tr>
						{#if req.outcome === 'rejected' && req.notes}
							<tr class="border-t border-border">
								<td colspan="10" class="px-4 py-2 text-sm text-muted">
									<span class="font-semibold text-heading">Rejection reason:</span>
									{req.notes}
								</td>
							</tr>
						{/if}
						{#if req.outcome !== 'rejected' && rejectingId === req.verificationId}
							<tr class="border-t border-border bg-surface-2">
								<td colspan="10" class="px-4 py-3">
									<form
										method="post"
										action="?/review"
										class="flex flex-wrap items-center gap-2"
										use:enhance={({ cancel }) => {
											if (
												req.outcome === 'approved' &&
												!confirm(`Revert ${req.firstName} ${req.otherNames}'s verification? Their profile goes back off the public pages immediately.`)
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
										<input type="hidden" name="verificationId" value={req.verificationId} />
										<input type="hidden" name="outcome" value="rejected" />
										<input
											type="text"
											name="notes"
											placeholder="Reason for {req.outcome === 'approved' ? 'reverting' : 'rejection'} (shown to the applicant)"
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
