<script lang="ts">
	import { enhance } from '$app/forms';
	import Pagination from '$lib/components/admin/Pagination.svelte';
	import { seatPath } from '$lib/utils/seat';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const dateFmt = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
	const totalPages = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)));

	// Which claim has its history/sign-off row expanded — clicking the row toggles
	// it; the extras (IEBC cert, claimant sign-off, claim history) are fetched on
	// demand and cached, so a page full of rows doesn't pay for all of them up front.
	let expandedId = $state<number | null>(null);
	let loadingId = $state<number | null>(null);
	let emailing = $state(false);
	type Extras = {
		iebcCertificateUrl: string | null;
		team: {
			name: string;
			title: string | null;
			nationalId: string | null;
			idFrontUrl: string | null;
			idBackUrl: string | null;
			signoffComplete: boolean;
			nationalIdConflict: { id: number; name: string; email: string; phone: string | null } | null;
			isApplicant: boolean;
			phone: string | null;
			email: string | null;
		}[];
		requestHistory: {
			id: number;
			requestedAt: string;
			outcome: 'approved' | 'rejected' | null;
			notes: string | null;
			reviewedAt: string | null;
			reviewerName: string | null;
		}[];
	};
	let extrasCache = $state<Record<number, Extras>>({});

	async function toggleExpand(claimId: number) {
		if (expandedId === claimId) {
			expandedId = null;
			return;
		}
		expandedId = claimId;
		emailing = false;
		if (extrasCache[claimId]) return;
		loadingId = claimId;
		try {
			const res = await fetch(`/dashboard/admin/claims/${claimId}`);
			if (res.ok) extrasCache[claimId] = await res.json();
		} finally {
			loadingId = null;
		}
	}
</script>

{#snippet idThumb(label: string, url: string | null)}
	<div>
		<p class="text-xs font-semibold tracking-wide text-muted uppercase">{label}</p>
		{#if url}
			<a href={url} target="_blank" rel="noopener" class="mt-1 block overflow-hidden rounded-lg border border-border">
				<img src={url} alt={label} class="aspect-3/2 w-full object-cover" />
			</a>
		{:else}
			<div class="mt-1 flex aspect-3/2 w-full items-center justify-center rounded-lg border border-dashed border-border">
				<p class="text-xs font-medium text-red-500">Missing</p>
			</div>
		{/if}
	</div>
{/snippet}

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
						<th class="px-4 py-3 text-sm font-semibold text-heading">Position</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Region</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Leader</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Claimant</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Requested</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Outcome</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each data.claims as claim (claim.claimId)}
						<tr
							class="cursor-pointer border-t border-border transition hover:bg-surface-2"
							onclick={() => toggleExpand(claim.claimId)}
						>
							<td class="px-4 py-3 text-sm text-muted">{claim.positionTitle}</td>
							<td class="px-4 py-3 text-sm text-muted">
								{#if seatPath(claim.positionTitle, claim.region)}
									<a
										href={seatPath(claim.positionTitle, claim.region)}
										target="_blank"
										rel="noopener"
										onclick={(e) => e.stopPropagation()}
										class="hover:text-primary hover:underline"
									>
										{claim.region}
									</a>
								{:else}
									{claim.region}
								{/if}
							</td>
							<td class="px-4 py-3 text-sm text-heading">
								<div class="flex items-center justify-between">
									<span class="flex items-center gap-1.5">
										<span class="text-muted transition {expandedId === claim.claimId ? 'rotate-90' : ''}">›</span>
										<span class="font-medium">{claim.subjectName}</span>
									</span>
									<span class="font-medium">{claim.subjectUserId}</span>
								</div>
							</td>
							<td class="px-4 py-3 text-sm text-muted">
								<div class="flex items-center justify-between">
									<span class="font-medium">{claim.claimantName}</span>
									<span class="font-medium">{claim.claimedByUserId}</span>
								</div>
							</td>
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
							<td class="px-4 py-3" onclick={(e) => e.stopPropagation()}>
								{#if claim.subjectSlug}
									<a
										href="/{claim.subjectSlug}"
										target="_blank"
										rel="noopener"
										class="rounded-full border border-border px-3 py-1 text-xs font-semibold text-heading transition hover:bg-surface-2"
									>
										Preview
									</a>
								{/if}
							</td>
						</tr>
						{#if claim.outcome === 'rejected' && claim.notes}
							<tr class="border-t border-border">
								<td colspan="7" class="px-4 py-2 text-sm text-muted">
									<span class="font-semibold text-heading">Rejection reason:</span>
									{claim.notes}
								</td>
							</tr>
						{/if}
						{#if expandedId === claim.claimId}
							<tr class="border-t border-border bg-surface-2" onclick={(e) => e.stopPropagation()}>
								<td colspan="7" class="px-4 py-4">
									{#if loadingId === claim.claimId}
										<p class="text-sm text-muted">Loading…</p>
									{:else if extrasCache[claim.claimId]}
										{@const extras = extrasCache[claim.claimId]}
										<!-- Decision controls, above the claim history table. -->
										<div class="flex flex-wrap items-center gap-2">
											<form method="post" action="?/review" use:enhance>
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
											</form>
											<form
												method="post"
												action="?/review"
												class="flex flex-1 flex-wrap items-center gap-2"
												use:enhance={({ formData, cancel }) => {
													if (
														formData.get('outcome') === 'rejected' &&
														claim.outcome === 'approved' &&
														!confirm(`Revert ${claim.claimantName}'s claim on ${claim.subjectName}'s profile? This removes their manager access immediately.`)
													) {
														cancel();
													}
												}}
											>
												<input type="hidden" name="claimId" value={claim.claimId} />
												<input
													type="text"
													name="notes"
													placeholder="Reason for {claim.outcome === 'approved' ? 'reverting' : 'rejection'} (shown to the claimant)"
													class="min-w-64 flex-1 rounded-full border border-border bg-surface px-3 py-1 text-xs text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
												/>
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
											{#if !claim.outcome}
												<button
													type="button"
													onclick={() => (emailing = !emailing)}
													class="rounded-full border border-border px-3 py-1 text-xs font-semibold text-heading transition hover:bg-surface-2"
												>
													{emailing ? 'Cancel' : 'Email the leader'}
												</button>
											{/if}
										</div>
										{#if !claim.outcome && emailing}
											<!-- Sends the leader their single-use approve/reject link to an address
											the admin knows out-of-band (e.g. no verified/sourced email on file). -->
											<form
												method="post"
												action="?/emailLeader"
												class="mt-2 flex flex-wrap items-center gap-2"
												use:enhance={() => {
													return async ({ update }) => {
														emailing = false;
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
													class="min-w-64 flex-1 rounded-full border border-border bg-surface px-3 py-1 text-xs text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
												/>
												<button
													type="submit"
													class="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-on-primary transition hover:brightness-95"
												>
													Send Approval Email
												</button>
											</form>
										{/if}

										<div class="mt-4 grid gap-4 lg:grid-cols-2">
											<div>
												<h3 class="text-sm font-semibold text-heading">IEBC certificate</h3>
												{#if extras.iebcCertificateUrl}
													<a href={extras.iebcCertificateUrl} target="_blank" rel="noopener" class="mt-1 block text-sm text-primary hover:underline">
														View uploaded file
													</a>
												{:else}
													<p class="mt-1 text-sm font-medium text-red-500">Missing</p>
												{/if}

												<h3 class="mt-4 text-sm font-semibold text-heading">Claim history</h3>
												<div class="mt-2 overflow-x-auto rounded-xl border border-border">
													<table class="w-full min-w-120 border-collapse text-left">
														<thead>
															<tr class="bg-surface">
																<th class="px-3 py-2 text-xs font-semibold text-heading">Requested</th>
																<th class="px-3 py-2 text-xs font-semibold text-heading">Outcome</th>
																<th class="px-3 py-2 text-xs font-semibold text-heading">Reviewed</th>
																<th class="px-3 py-2 text-xs font-semibold text-heading">Reviewer</th>
																<th class="px-3 py-2 text-xs font-semibold text-heading">Notes</th>
															</tr>
														</thead>
														<tbody>
															{#each extras.requestHistory as h (h.id)}
																<tr class="border-t border-border">
																	<td class="px-3 py-2 text-xs text-muted">{dateFmt.format(new Date(h.requestedAt))}</td>
																	<td class="px-3 py-2 text-xs capitalize text-heading">{h.outcome ?? 'pending'}</td>
																	<td class="px-3 py-2 text-xs text-muted">{h.reviewedAt ? dateFmt.format(new Date(h.reviewedAt)) : '—'}</td>
																	<td class="px-3 py-2 text-xs text-muted">{h.reviewerName ?? '—'}</td>
																	<td class="px-3 py-2 text-xs text-muted">{h.notes ?? '—'}</td>
																</tr>
															{/each}
														</tbody>
													</table>
												</div>
											</div>

											<div>
												<h3 class="text-sm font-semibold text-heading">Sign-off</h3>
												{#if extras.team.length > 0}
													<div class="mt-2 space-y-2">
														{#each extras.team as member (member.name)}
															<div class="rounded-xl border border-border bg-surface p-3">
																<div class="flex flex-wrap items-center gap-1.5">
																	<span class="text-sm font-semibold text-heading">{member.name}</span>
																	{#if member.signoffComplete}
																		<span class="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-on-primary">Signed off</span>
																	{:else}
																		<span class="rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-muted">No sign-off</span>
																	{/if}
																</div>
																<p class="mt-1 text-xs text-muted">
																	{member.email ?? 'No email'} · {member.phone ?? 'No phone'}
																</p>
																<p class="mt-1 text-xs text-muted">
																	{member.title ?? 'No role'} · ID: {member.nationalId ?? 'Missing'}
																</p>
																{#if member.nationalIdConflict}
																	{@const conflict = member.nationalIdConflict}
																	<p class="mt-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs font-medium text-red-500">
																		Same National ID on {conflict.name} ({conflict.email}, {conflict.phone ?? 'no phone'}), user id {conflict.id}.
																	</p>
																{/if}
																<div class="mt-2 grid grid-cols-2 gap-2">
																	{@render idThumb('ID front', member.idFrontUrl)}
																	{@render idThumb('ID back', member.idBackUrl)}
																</div>
															</div>
														{/each}
													</div>
												{:else}
													<p class="mt-1 text-sm text-muted">No sign-off yet.</p>
												{/if}
											</div>
										</div>
									{/if}
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
