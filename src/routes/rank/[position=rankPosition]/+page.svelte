<script lang="ts">
	import { preloadData } from '$app/navigation';
	import DataTable, { type Column } from '$lib/components/DataTable.svelte';
	import PositionBadges from '$lib/components/PositionBadges.svelte';
	import QuickSearch from '$lib/components/QuickSearch.svelte';
	import { RANK_POSITIONS } from '$lib/utils/rankPositions';
	import { seatPath } from '$lib/utils/seat';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const fmt = new Intl.NumberFormat('en-KE');

	// DataTable rows need an id; the flat URL path is unique per person.
	const rows = $derived(data.leaders.map((l) => ({ ...l, id: l.path })));
	type Row = (typeof rows)[number];

	const columns: Column<Row>[] = [
		{ key: 'rank', label: '#' },
		{ key: 'name', label: 'Leader', sortable: true },
		{ key: 'score', label: 'Score', sortable: true, format: (v) => fmt.format(v as number) },
		{ key: 'followers', label: 'Followers', sortable: true, format: (v) => fmt.format(v as number) },
		{ key: 'pledges', label: 'Pledges', sortable: true, format: (v) => fmt.format(v as number) },
		{ key: 'postCount', label: 'Posts', sortable: true },
		{ key: 'delivered', label: 'Delivered', sortable: true, format: (v, r) => `${v}/${r.pillarCount}` }
	];

	const hrefFor = (title: string) => `/rank/${RANK_POSITIONS.find((p) => p.title === title)?.slug ?? 'presidents'}`;
	const pagerHref = (p: number) => `/rank/${data.position}?page=${p}`;

	// Once this position has rendered, warm the other five in the background so
	// pill hops land instantly (preloadData + the load's cache-control header).
	$effect(() => {
		const others = RANK_POSITIONS.filter((p) => p.slug !== data.position);
		const idle = setTimeout(() => others.forEach((p) => void preloadData(`/rank/${p.slug}`)), 500);
		return () => clearTimeout(idle);
	});
</script>

<svelte:head>
	<title>{data.title} rankings — leaders.ke</title>
	<meta
		name="description"
		content="Kenya's {data.title.toLowerCase()}s ranked by followers, pledges, output and manifesto delivery."
	/>
</svelte:head>

<section class="mx-auto max-w-7xl px-4 py-14 sm:px-6">
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div class="">
			<h1 class="text-3xl font-extrabold tracking-tight text-heading sm:text-4xl">The LeaderRank</h1>
			<p class="mt-3 text-base leading-relaxed">
				Ranked by a transparent engagement score: followers + 5× vote pledges + 10× public posts +
				100× delivered manifesto pillars.
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-4">
			<!-- Leader quick-jump (leaders-only groups) beside the position pill bar -->
			<QuickSearch include={['Executive', 'Parliament', 'MCAs']} expand={false} placeholder="Find a leader…" />
			<PositionBadges positions={RANK_POSITIONS.map((p) => p.title)} value={data.title} {hrefFor} />
		</div>
	</div>

	<div class="mt-8">
		<DataTable {columns} {rows} itemLabel="leaders" total={data.total} page={data.page} pageSize={data.pageSize} {pagerHref}>
			{#snippet cell({ row, column, value })}
				{#if column.key === 'name'}
					<a href={row.path} class="font-medium text-heading hover:text-primary">{row.name}</a>
					<p class="text-xs text-muted">
						{#if seatPath(data.title, row.regionLabel)}
							<a href={seatPath(data.title, row.regionLabel)} class="hover:text-primary">
								{data.title}, {row.regionLabel}
							</a>
						{:else}
							{data.title}, {row.regionLabel}
						{/if}
						<span class="capitalize"> · {row.status}</span>
					</p>
				{:else if column.key === 'rank'}
					<span class="font-bold tabular-nums text-muted">{row.rank}</span>
				{:else if column.key === 'score'}
					<span class="font-bold tabular-nums text-primary">{fmt.format(row.score)}</span>
				{:else}
					<span class="tabular-nums">{column.format ? column.format(value, row) : String(value)}</span>
				{/if}
			{/snippet}
		</DataTable>
	</div>

	<p class="mt-4 text-center text-sm text-muted">
		Want to move up? <a href="/signup" class="font-semibold text-primary hover:underline">Claim your profile</a>
		and start building your base, or
		<a href="/compare" class="font-semibold text-primary hover:underline">compare two leaders side by side</a>.
	</p>
</section>
