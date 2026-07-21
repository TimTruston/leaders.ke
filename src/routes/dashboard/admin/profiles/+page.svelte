<script lang="ts">
	import Pagination from '$lib/components/admin/Pagination.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const totalPages = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)));
	const dateFmt = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short' });

	// Click a row to expand its review history (claims on this profile + verification
	// requests on its runs), fetched on demand and cached — so a full page of rows
	// doesn't pay for all their histories up front.
	type Extras = {
		applicantName: string | null;
		claimHistory: { id: number; claimantName: string; requestedAt: string; outcome: string | null; deleted: boolean; reviewedAt: string | null; reviewerName: string | null; notes: string | null }[];
		applications: { id: number; candidateName: string; requestedAt: string; outcome: string | null; reviewedAt: string | null; reviewerName: string | null; notes: string | null }[];
	};
	let expandedId = $state<number | null>(null);
	let loadingId = $state<number | null>(null);
	let extrasCache = $state<Record<number, Extras>>({});

	async function toggleExpand(profileId: number) {
		if (expandedId === profileId) {
			expandedId = null;
			return;
		}
		expandedId = profileId;
		if (extrasCache[profileId]) return;
		loadingId = profileId;
		try {
			const res = await fetch(`/dashboard/admin/profiles/${profileId}`);
			if (res.ok) extrasCache[profileId] = await res.json();
		} finally {
			loadingId = null;
		}
	}

	// Keep the current search in the pager links.
	function pagerHref(p: number) {
		const params = new URLSearchParams();
		if (data.q) params.set('q', data.q);
		params.set('page', String(p));
		return `?${params}`;
	}

	// Hover explanations for the derived pills (they aren't stored — see profiles.ts).
	const SOURCE_HELP = 'How the profile came to exist: has a claim → claimed; else has an active manager → applied; else → seeded.';
	const VERIFIED_HELP =
		'Review-workflow state, keyed off source: seeded → —; claimed → latest claim outcome (pending/approved/rejected); applied → run verified → approved, else latest verification request outcome; soft-deleted person → deleted.';

	// Colour the source + verified pills.
	const sourceClass: Record<string, string> = {
		seeded: 'border border-border text-muted',
		applied: 'bg-primary-soft text-on-primary',
		claimed: 'bg-surface-2 text-heading'
	};
	function verifiedClass(v: string | null) {
		if (v === 'approved') return 'bg-primary-soft text-on-primary';
		if (v === 'rejected' || v === 'deleted') return 'bg-surface-2 text-muted';
		if (v === 'pending') return 'border border-primary text-primary';
		return 'border border-border text-muted';
	}
</script>

<svelte:head><title>Profiles — Admin</title></svelte:head>

<div>
	<h1 class="text-xl font-bold text-heading">Profiles</h1>
	<p class="mt-1 text-sm text-muted">
		Every leader profile — seeded, applied and claimed — one row per person. "Admin" opens the
		leader's own dashboard, where you can edit, review and decide.
	</p>

	<!-- Server-side search across all pages. -->
	<form method="get" class="mt-6 flex items-center gap-2">
		<input
			type="search"
			name="q"
			value={data.q}
			placeholder="Search name, URL, seat or manager…"
			class="w-full max-w-xs rounded-full border border-border bg-surface px-4 py-2 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
		/>
		<button type="submit" class="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95">Search</button>
		{#if data.q}<a href="?" class="text-sm text-muted hover:text-heading">Clear</a>{/if}
	</form>

	{#if data.profiles.length > 0}
		<div class="mt-4 overflow-x-auto rounded-2xl border border-border">
			<table class="w-full min-w-240 border-collapse text-left">
				<thead>
					<tr class="bg-surface-2">
						<th title="The account controlling the profile: the claimant or the applicant (blank for a seeded profile with neither)." class="cursor-help px-4 py-3 text-sm font-semibold text-heading">Manager</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Profile</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Position</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Region</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Status</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Source</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Verified</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each data.profiles as p (p.profileId)}
						<tr class="cursor-pointer border-t border-border transition hover:bg-surface-2" onclick={() => toggleExpand(p.profileId)}>
							<td class="px-4 py-3 text-sm text-muted">
								{#if p.managerName}
									<div class="flex items-center justify-between gap-2">
										<span class="font-medium">{p.managerName}</span>
										<span class="font-medium">{p.managerId}</span>
									</div>
								{:else}
									—
								{/if}
							</td>
							<td class="px-4 py-3 text-sm text-heading">
								<div class="flex items-center justify-between gap-2">
									<span class="flex items-center gap-1.5">
										<span class="text-muted transition {expandedId === p.profileId ? 'rotate-90' : ''}">›</span>
										<span class="font-medium">{p.profileName}</span>
									</span>
									<span class="font-medium text-muted">{p.profileId}</span>
								</div>
							</td>
							<td class="px-4 py-3 text-sm text-muted">{p.positionTitle}</td>
							<td class="px-4 py-3 text-sm text-muted" onclick={(e) => e.stopPropagation()}>
								{#if p.regionPath}
									<a href={p.regionPath} target="_blank" rel="noopener" class="hover:text-primary hover:underline">{p.region}</a>
								{:else}
									{p.region}
								{/if}
							</td>
							<td class="px-4 py-3 text-sm capitalize text-muted">{p.status}</td>
							<td class="px-4 py-3 text-sm">
								<span title={SOURCE_HELP} class="cursor-help rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize {sourceClass[p.source]}">{p.source}</span>
							</td>
							<td class="px-4 py-3 text-sm">
								<span title={VERIFIED_HELP} class="cursor-help rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize {verifiedClass(p.verified)}">{p.verified ?? '—'}</span>
							</td>
							<td class="px-4 py-3" onclick={(e) => e.stopPropagation()}>
								<div class="flex items-center gap-1.5">
									<a href={p.adminPath} class="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-on-primary transition hover:brightness-95">Admin</a>
									<a href={p.profilePath} target="_blank" rel="noopener" class="rounded-full border border-border px-3 py-1 text-xs font-semibold text-heading transition hover:bg-surface-2">Preview &#8599;</a>
								</div>
							</td>
						</tr>
						{#if expandedId === p.profileId}
							<tr class="border-t border-border bg-surface-2" onclick={(e) => e.stopPropagation()}>
								<td colspan="8" class="px-4 py-4">
									{#if loadingId === p.profileId}
										<p class="text-sm text-muted">Loading…</p>
									{:else if extrasCache[p.profileId]}
										{@const extras = extrasCache[p.profileId]}
										<!-- Only one of the two histories renders per profile (they're keyed on
										source), so the single table takes the full row width. -->
										<div>
											<!-- Claim history: past claimants + verdicts. An applied profile can't be
											claimed, so this shows only for seeded/claimed ones. -->
											{#if p.source !== 'applied'}
											<div>
												<h3 class="text-sm font-semibold text-heading">Claim history</h3>
												{#if extras.claimHistory.length > 0}
													<div class="mt-2 overflow-x-auto rounded-xl border border-border">
														<table class="w-full min-w-120 border-collapse text-left">
															<thead>
																<tr class="bg-surface">
																	<th class="px-3 py-2 text-xs font-semibold text-heading">Claimant</th>
																	<th class="px-3 py-2 text-xs font-semibold text-heading">Requested</th>
																	<th class="px-3 py-2 text-xs font-semibold text-heading">Reviewed</th>
																	<th class="px-3 py-2 text-xs font-semibold text-heading">Reviewer</th>
																	<th class="px-3 py-2 text-xs font-semibold text-heading">Outcome</th>
																	<th class="px-3 py-2 text-xs font-semibold text-heading">Notes</th>
																</tr>
															</thead>
															<tbody>
																{#each extras.claimHistory as h (h.id)}
																	<tr class="border-t border-border">
																		<td class="px-3 py-2 text-xs text-heading">{h.claimantName}</td>
																		<td class="px-3 py-2 text-xs text-muted">{dateFmt.format(new Date(h.requestedAt))}</td>
																		<td class="px-3 py-2 text-xs text-muted">{h.reviewedAt ? dateFmt.format(new Date(h.reviewedAt)) : '—'}</td>
																		<td class="px-3 py-2 text-xs text-muted">{h.reviewerName ?? '—'}</td>
																		<td class="px-3 py-2 text-xs capitalize text-heading">{h.deleted ? 'withdrawn' : (h.outcome ?? 'pending')}</td>
																		<td class="px-3 py-2 text-xs text-muted">{h.notes ?? '—'}</td>
																	</tr>
																{/each}
															</tbody>
														</table>
													</div>
												{:else}
													<p class="mt-1 text-sm text-muted">No claims on this profile.</p>
												{/if}
											</div>
											{/if}

											<!-- Application history: every application the profile's APPLICANT submitted,
											across every candidate they represent — for applied profiles only. -->
											{#if p.source === 'applied'}
											<div>
												<h3 class="text-sm font-semibold text-heading">Applications by {extras.applicantName ?? 'the applicant'}</h3>
												{#if extras.applications.length > 0}
													<div class="mt-2 overflow-x-auto rounded-xl border border-border">
														<table class="w-full min-w-120 border-collapse text-left">
															<thead>
																<tr class="bg-surface">
																	<th class="px-3 py-2 text-xs font-semibold text-heading">Candidate</th>
																	<th class="px-3 py-2 text-xs font-semibold text-heading">Requested</th>
																	<th class="px-3 py-2 text-xs font-semibold text-heading">Reviewed</th>
																	<th class="px-3 py-2 text-xs font-semibold text-heading">Reviewer</th>
																	<th class="px-3 py-2 text-xs font-semibold text-heading">Outcome</th>
																	<th class="px-3 py-2 text-xs font-semibold text-heading">Notes</th>
																</tr>
															</thead>
															<tbody>
																{#each extras.applications as h (h.id)}
																	<tr class="border-t border-border">
																		<td class="px-3 py-2 text-xs text-heading">{h.candidateName}</td>
																		<td class="px-3 py-2 text-xs text-muted">{dateFmt.format(new Date(h.requestedAt))}</td>
																		<td class="px-3 py-2 text-xs text-muted">{h.reviewedAt ? dateFmt.format(new Date(h.reviewedAt)) : '—'}</td>
																		<td class="px-3 py-2 text-xs text-muted">{h.reviewerName ?? '—'}</td>
																		<td class="px-3 py-2 text-xs capitalize text-heading">{h.outcome ?? 'pending'}</td>
																		<td class="px-3 py-2 text-xs text-muted">{h.notes ?? '—'}</td>
																	</tr>
																{/each}
															</tbody>
														</table>
													</div>
												{:else}
													<p class="mt-1 text-sm text-muted">No applications by {extras.applicantName ?? 'the applicant'}.</p>
												{/if}
											</div>
											{/if}
										</div>
									{/if}
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</div>
		<Pagination page={data.page} {totalPages} total={data.total} itemLabel="profiles" href={pagerHref} />
	{:else}
		<p class="mt-6 text-sm text-muted">{data.q ? `No profiles match “${data.q}”.` : 'No profiles yet.'}</p>
	{/if}
</div>
