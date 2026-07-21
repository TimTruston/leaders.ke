<script lang="ts">
	import Pagination from '$lib/components/admin/Pagination.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const totalPages = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)));

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
						<tr class="border-t border-border">
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
									<span class="font-medium">{p.profileName}</span>
									<span class="font-medium text-muted">{p.profileId}</span>
								</div>
							</td>
							<td class="px-4 py-3 text-sm text-muted">{p.positionTitle}</td>
							<td class="px-4 py-3 text-sm text-muted">
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
							<td class="px-4 py-3">
								<div class="flex items-center gap-1.5">
									<a href={p.adminPath} class="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-on-primary transition hover:brightness-95">Admin</a>
									<a href={p.profilePath} target="_blank" rel="noopener" class="rounded-full border border-border px-3 py-1 text-xs font-semibold text-heading transition hover:bg-surface-2">Profile &#8599;</a>
									{#if p.campaignYear}
										<a href="{p.profilePath}/{p.campaignYear}" target="_blank" rel="noopener" class="rounded-full border border-border px-3 py-1 text-xs font-semibold text-heading transition hover:bg-surface-2">Campaign &#8599;</a>
									{/if}
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<Pagination page={data.page} {totalPages} total={data.total} itemLabel="profiles" href={pagerHref} />
	{:else}
		<p class="mt-6 text-sm text-muted">{data.q ? `No profiles match “${data.q}”.` : 'No profiles yet.'}</p>
	{/if}
</div>
