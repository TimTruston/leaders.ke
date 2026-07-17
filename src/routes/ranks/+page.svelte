<script lang="ts">
	import Paginator from '$lib/components/Paginator.svelte';
	import PositionBadges from '$lib/components/PositionBadges.svelte';
	import QuickSearch from '$lib/components/QuickSearch.svelte';
	import { seatPath } from '$lib/utils/seat';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const fmt = new Intl.NumberFormat('en-KE');

	const PAGE_SIZE = 50;

	let page = $state(1);
	let positionFilter = $state('President');
	const positionTitles = $derived([...new Set(data.leaders.map((l) => l.positionTitle))]);
	const filtered = $derived(
		data.leaders.filter((l) => !positionFilter || l.positionTitle === positionFilter)
	);
	const totalPages = $derived(Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
	const paged = $derived(filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));

	// Switching the position pill resets to page 1.
	$effect(() => {
		positionFilter;
		page = 1;
	});
</script>

<svelte:head>
	<title>LeaderRank — leaders.ke</title>
	<meta
		name="description"
		content="Kenya's leaders and 2027 candidates ranked by followers, pledges, output and manifesto delivery."
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
			<PositionBadges positions={positionTitles} bind:value={positionFilter} />
		</div>
	</div>

	<div class="mt-8 overflow-x-auto rounded-2xl border border-border">
		<table class="w-full min-w-160 border-collapse text-left">
			<thead>
				<tr class="bg-surface-2">
					<th class="px-4 py-3 text-sm font-semibold text-heading">#</th>
					<th class="px-4 py-3 text-sm font-semibold text-heading">Leader</th>
					<th class="px-4 py-3 text-sm font-semibold text-heading">Score</th>
					<th class="px-4 py-3 text-sm font-semibold text-heading">Followers</th>
					<th class="px-4 py-3 text-sm font-semibold text-heading">Pledges</th>
					<th class="px-4 py-3 text-sm font-semibold text-heading">Posts</th>
					<th class="px-4 py-3 text-sm font-semibold text-heading">Delivered</th>
				</tr>
			</thead>
			<tbody>
				{#each paged as leader, i (leader.path)}
					<tr class="border-t border-border">
						<td class="px-4 py-3 text-sm font-bold tabular-nums text-muted">{(page - 1) * PAGE_SIZE + i + 1}</td>
						<td class="px-4 py-3">
							<a href={leader.path} class="text-sm font-medium text-heading hover:text-primary">
								{leader.name}{#if leader.verified}<span class="ml-1 text-primary">✓</span>{/if}
							</a>
							<p class="text-xs text-muted">
								{#if seatPath(leader.positionTitle, leader.regionLabel)}
									<a href={seatPath(leader.positionTitle, leader.regionLabel)} class="hover:text-primary">
										{leader.positionTitle}, {leader.regionLabel}
									</a>
								{:else}
									{leader.positionTitle}, {leader.regionLabel}
								{/if}
								<span class="capitalize"> · {leader.status}</span>
							</p>
						</td>
						<td class="px-4 py-3 text-sm font-bold tabular-nums text-primary">{fmt.format(leader.score)}</td>
						<td class="px-4 py-3 text-sm tabular-nums">{fmt.format(leader.followers)}</td>
						<td class="px-4 py-3 text-sm tabular-nums">{fmt.format(leader.pledges)}</td>
						<td class="px-4 py-3 text-sm tabular-nums">{leader.postCount}</td>
						<td class="px-4 py-3 text-sm tabular-nums">{leader.delivered}/{leader.pillarCount}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<Paginator bind:page {totalPages} />

	<p class="mt-4 text-center text-sm text-muted">
		Want to move up? <a href="/signup" class="font-semibold text-primary hover:underline">Claim your profile</a>
		and start building your base, or
		<a href="/compare" class="font-semibold text-primary hover:underline">compare two leaders side by side</a>.
	</p>
</section>
