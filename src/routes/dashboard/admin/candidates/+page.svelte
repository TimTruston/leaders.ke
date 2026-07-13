<script lang="ts">
	import Pagination from '$lib/components/admin/Pagination.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const totalPages = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)));
</script>

<svelte:head><title>Candidates — Admin</title></svelte:head>

<div>
	<h1 class="text-xl font-bold text-heading">Candidates</h1>
	<p class="mt-1 text-sm text-muted">Every leader profile on the platform, aspirant through former.</p>

	{#if data.candidates.length > 0}
		<div class="mt-6 overflow-x-auto rounded-2xl border border-border">
			<table class="w-full min-w-180 border-collapse text-left">
				<thead>
					<tr class="bg-surface-2">
						<th class="px-4 py-3 text-sm font-semibold text-heading">Name</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Position</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Region</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Status</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Verified</th>
					</tr>
				</thead>
				<tbody>
					{#each data.candidates as c (c.leaderId)}
						<tr class="border-t border-border">
							<td class="px-4 py-3 text-sm text-heading">
								<a href={c.path} class="hover:text-primary">{c.name}</a>
							</td>
							<td class="px-4 py-3 text-sm text-muted">{c.positionTitle}</td>
							<td class="px-4 py-3 text-sm text-muted">{c.region}</td>
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
