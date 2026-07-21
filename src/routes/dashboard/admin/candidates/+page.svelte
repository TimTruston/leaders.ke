<script lang="ts">
	import { enhance } from '$app/forms';
	import Pagination from '$lib/components/admin/Pagination.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const totalPages = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)));
</script>

<svelte:head><title>Candidates — Admin</title></svelte:head>

<div>
	<h1 class="text-xl font-bold text-heading">Candidates</h1>
	<p class="mt-1 text-sm text-muted">Held terms and the verified 2027 runs. Record a win to graduate a run into a current term.</p>

	{#if form?.graduated}
		<p class="mt-4 rounded-lg bg-primary-soft px-4 py-2 text-sm font-medium text-on-primary">Win recorded — the run is now a current term.</p>
	{:else if form?.error}
		<p class="mt-4 rounded-lg border border-border px-4 py-2 text-sm text-muted">{form.error}</p>
	{/if}

	{#if data.candidates.length > 0}
		<div class="mt-6 overflow-x-auto rounded-2xl border border-border">
			<table class="w-full min-w-180 border-collapse text-left">
				<thead>
					<tr class="bg-surface-2">
						<th class="px-4 py-3 text-sm font-semibold text-heading">ID</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Name</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Position</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Region</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Status</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Verified</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Result</th>
					</tr>
				</thead>
				<tbody>
					{#each data.candidates as c (c.key)}
						<tr class="border-t border-border">
							<td class="px-4 py-3 text-sm text-heading">
								<a href={c.path} class="hover:text-primary">{c.campaignId}</a>
							</td>
							<td class="px-4 py-3 text-sm text-heading">
								<a href={c.path} class="hover:text-primary">{c.name}</a>
							</td>
							<td class="px-4 py-3 text-sm text-muted">{c.positionTitle}</td>
							<td class="px-4 py-3 text-sm text-muted">
								{#if c.regionPath}
									<a href={c.regionPath} target="_blank" rel="noopener" class="hover:text-primary hover:underline">{c.region}</a>
								{:else}
									{c.region}
								{/if}
							</td>
							<td class="px-4 py-3 text-sm capitalize text-muted">{c.status}</td>
							<td class="px-4 py-3 text-sm">
								{#if c.verified}
									<span class="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-on-primary">
										Verified
									</span>
								{:else}
									<span class="rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold text-muted">
										Unverified
									</span>
								{/if}
							</td>
							<td class="px-4 py-3 text-sm">
								{#if c.campaignId}
									<form method="POST" action="?/graduate" use:enhance>
										<input type="hidden" name="campaignId" value={c.campaignId} />
										<button
											type="submit"
											class="rounded-full border border-border px-3 py-1 text-xs font-semibold text-heading hover:border-primary hover:text-primary"
											onclick={(e) => { if (!confirm(`Record ${c.name} as the winner of ${c.positionTitle}, ${c.region}? This creates a current term.`)) e.preventDefault(); }}
										>
											Record win
										</button>
									</form>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<Pagination page={data.page} {totalPages} total={data.total} itemLabel="candidates" href={(p) => `?page=${p}`} />
	{:else}
		<p class="mt-6 text-sm text-muted">No candidates yet.</p>
	{/if}
</div>
