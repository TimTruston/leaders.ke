<script lang="ts">
	import { enhance } from '$app/forms';
	import Pagination from '$lib/components/admin/Pagination.svelte';
	import { seatPath } from '$lib/utils/seat';
	import { formatKenyanPhoneDisplay, normalizeKenyanPhone } from '$lib/utils/phone';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const dateFmt = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
	const totalPages = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)));

	// Which request has its history/team row expanded — clicking the row toggles
	// it; the extras (IEBC cert, team sign-offs, request history) are fetched on
	// demand and cached, so a page full of rows doesn't pay for all of them up front.
	let expandedId = $state<number | null>(null);
	let loadingId = $state<number | null>(null);
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

	async function toggleExpand(verificationId: number) {
		if (expandedId === verificationId) {
			expandedId = null;
			return;
		}
		expandedId = verificationId;
		if (extrasCache[verificationId]) return;
		loadingId = verificationId;
		try {
			const res = await fetch(`/dashboard/admin/verifications/${verificationId}`);
			if (res.ok) extrasCache[verificationId] = await res.json();
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

<!-- A stored 254… number shown as a callable 0700 000 000 (leading zero, no
country code, two gaps); falls back to a plain label when there's no number. -->
{#snippet phone(value: string | null, empty: string)}
	{#if value}
		<a href="tel:+{normalizeKenyanPhone(value) ?? value.replace(/\D/g, '')}" class="hover:text-primary hover:underline">{formatKenyanPhoneDisplay(value)}</a>
	{:else}
		{empty}
	{/if}
{/snippet}

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
						<th class="px-4 py-3 text-sm font-semibold text-heading">Position</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Region</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">User</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Requested</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Outcome</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each data.requests as req (req.verificationId)}
						<!-- A verified profile has a public URL; an unapproved application is
						slugless, so preview it via the id-keyed /previews/[userId] route. -->
						{@const base = req.slug ? `/${req.slug}` : `/previews/${req.userId}`}
						<tr
							class="cursor-pointer border-t border-border transition hover:bg-surface-2"
							onclick={() => toggleExpand(req.verificationId)}
						>
							<td class="px-4 py-3 text-xs text-muted">{req.positionTitle}</td>
							<td class="px-4 py-3 text-xs text-muted">
								{#if seatPath(req.positionTitle, req.region)}
									<a
										href={seatPath(req.positionTitle, req.region)}
										target="_blank"
										rel="noopener"
										onclick={(e) => e.stopPropagation()}
										class="hover:text-primary hover:underline"
									>
										{req.region}
									</a>
								{:else}
									{req.region}
								{/if}
							</td>
							<td class="px-4 py-3 text-xs">
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-1.5">
										<span class="text-muted transition {expandedId === req.verificationId ? 'rotate-90' : ''}">›</span>
										<span class="font-medium text-heading">{req.firstName} {req.otherNames}</span>
									</div>
									<span class="font-medium">{req.userId}</span>
								</div>
							</td>
							<td class="px-4 py-3 text-xs text-muted">{dateFmt.format(new Date(req.requestedAt))}</td>
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
							<td class="px-4 py-3 text-xs" onclick={(e) => e.stopPropagation()}>
								<div class="flex items-center justify-between">
									<a
										href={base}
										target="_blank"
										rel="noopener"
										class="rounded-full border border-border px-2 py-0.5 text-xs text-heading transition hover:bg-surface-2"
									>
										Profile
									</a>
									<a
										href="{base}/2027"
										target="_blank"
										rel="noopener"
										class="rounded-full border border-border px-2 py-0.5 text-xs text-heading transition hover:bg-surface-2"
									>
										Campaign {req.campaignId}
									</a>
								</div>
							</td>
						</tr>
						{#if expandedId === req.verificationId}
							<tr class="border-t border-border bg-surface-2" onclick={(e) => e.stopPropagation()}>
								<td colspan="10" class="px-4 py-4">
									{#if loadingId === req.verificationId}
										<p class="text-sm text-muted">Loading…</p>
									{:else if extrasCache[req.verificationId]}
										<!-- Decision controls, above the claim history table. -->
										<div class="flex items-center">
											<form
												method="post"
												action="?/review"
												class="flex-1 flex flex-wrap items-center gap-2"
												use:enhance={({ formData, cancel }) => {
													if (
														formData.get('outcome') === 'rejected' &&
														req.outcome === 'approved' &&
														!confirm(`Revert ${req.firstName} ${req.otherNames}'s verification? Their profile goes back off the public pages immediately.`)
													) {
														cancel();
													}
												}}
											>
												<input type="hidden" name="verificationId" value={req.verificationId} />
												<!-- Prefilled with the person's URL (verified) or a fresh autogenerated
												slug (an application is slugless until approval sets this). -->
												<input
													type="text"
													name="slug"
													value={req.suggestedSlug}
													placeholder="enter-a-slug"
													class="min-w-64 rounded-full border border-border bg-surface px-3 py-1 text-xs text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
												/>
												{#if req.outcome !== 'approved'}
													<button
														type="submit"
														name="outcome"
														value="approved"
														class="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-on-primary transition hover:brightness-95"
													>
														Approve
													</button>
												{/if}
												<input
													type="text"
													name="notes"
													placeholder="Reason for {req.outcome === 'approved' ? 'reverting' : 'rejection'} (shown to the applicant)"
													class="min-w-64 flex-1 rounded-full border border-border bg-surface px-3 py-1 text-xs text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
												/>
												{#if req.outcome !== 'rejected'}
													<button
														type="submit"
														name="outcome"
														value="rejected"
														class="rounded-full border border-border px-3 py-1 text-xs font-semibold text-heading transition hover:bg-surface-2"
													>
														{req.outcome === 'approved' ? 'Revert' : 'Reject'}
													</button>
												{/if}
											</form>
										</div>
										{@const extras = extrasCache[req.verificationId]}
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

												<h3 class="mt-4 text-sm font-semibold text-heading">Verification history</h3>
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
															<!-- The decision row: always first, live-editable. -->
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
												<h3 class="text-sm font-semibold text-heading">Team &amp; sign-offs</h3>
												{#if extras.team.length > 0}
													<div class="mt-2 space-y-2">
														{#each extras.team as member (member.name)}
															<div class="rounded-xl border border-border bg-surface p-3">
																<div class="flex flex-wrap items-center gap-1.5">
																	<span class="text-sm font-semibold text-heading">{member.name}</span>
																	{#if member.isApplicant}
																		<span class="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">applicant</span>
																	{/if}
																	{#if member.signoffComplete}
																		<span class="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-on-primary">Signed off</span>
																	{:else}
																		<span class="rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-muted">No sign-off</span>
																	{/if}
																</div>
																<p class="mt-1 text-xs text-muted">
																	{member.email ?? 'No email'} · {@render phone(member.phone, 'No phone')}
																</p>
																<p class="mt-1 text-xs text-muted">
																	{member.title ?? 'No role'} · ID: {member.nationalId ?? 'Missing'}
																</p>
																{#if member.nationalIdConflict}
																	{@const conflict = member.nationalIdConflict}
																	<p class="mt-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs font-medium text-red-500">
																		Same National ID on {conflict.name} ({conflict.email}, {@render phone(conflict.phone, 'no phone')}), user id {conflict.id}.
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
													<p class="mt-1 text-sm text-muted">No team members yet.</p>
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
		<Pagination page={data.page} {totalPages} total={data.total} itemLabel="requests" href={(p) => `?page=${p}`} />
	{:else}
		<p class="mt-6 text-sm text-muted">No verification requests yet.</p>
	{/if}
</div>
