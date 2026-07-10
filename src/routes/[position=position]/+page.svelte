<script lang="ts">
	import SeatHub from '$lib/components/SeatHub.svelte';
	import Paginator from '$lib/components/Paginator.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const PAGE_SIZE = 50;
	let page = $state(1);
	const totalPages = $derived(data.hub ? 1 : Math.max(1, Math.ceil(data.regions.length / PAGE_SIZE)));
	const pagedRegions = $derived(data.hub ? [] : data.regions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));
</script>

<svelte:head>
	{#if !data.hub}
		<title>{data.positionTitle} — all regions | leaders.ke</title>
		<meta
			name="description"
			content="Every region electing a {data.positionTitle} in the 2027 Kenya General Elections, with incumbents and cleared contestants."
		/>
	{/if}
</svelte:head>

{#if data.hub}
	<SeatHub data={data.hub} />
{:else}
	<section class="mx-auto max-w-7xl px-4 py-14 sm:px-6">
		<nav class="text-sm text-muted" aria-label="Breadcrumb">
			<a href="/leaders" class="hover:text-heading hover:underline">Leaders</a>
			<span class="mx-1">/</span>
			<span>{data.positionTitle}</span>
		</nav>

		<h1 class="mt-4 text-3xl font-extrabold tracking-tight text-heading sm:text-4xl">
			{data.positionTitle}
		</h1>
		<p class="mt-3  text-base leading-relaxed">
			Every region electing a {data.positionTitle} in 2027. Open a region to see the incumbent, the
			contestants and the seat's history.
		</p>

		<div class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each pagedRegions as region (region.path)}
				<a
					href={region.path}
					class="group rounded-2xl border border-border bg-surface p-5 transition hover:border-primary hover:shadow-sm"
				>
					<div class="flex items-center justify-between gap-2">
						<h2 class="font-semibold text-heading group-hover:text-primary">{region.region}</h2>
						<span class="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">
							{region.boundary}
						</span>
					</div>
					<p class="mt-3 text-sm">
						{#if region.incumbentName}
							Incumbent: <span class="font-medium text-heading">{region.incumbentName}</span>
						{:else}
							<span class="text-muted">No incumbent on record yet</span>
						{/if}
					</p>
					<p class="mt-1 text-xs text-muted">
						{region.contestantCount} contestant{region.contestantCount === 1 ? '' : 's'} for 2027
					</p>
				</a>
			{/each}
		</div>

		<Paginator bind:page {totalPages} />
	</section>
{/if}
