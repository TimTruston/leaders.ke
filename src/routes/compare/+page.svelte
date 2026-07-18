<script lang="ts">
	import { goto } from '$app/navigation';
	import LeaderCard from '$lib/components/LeaderCard.svelte';
	import QuickSearch from '$lib/components/QuickSearch.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const fmt = new Intl.NumberFormat('en-KE');

	let a = $state('');
	let b = $state('');
	// Sync the pickers with the URL-selected pair on load and after navigation.
	$effect(() => {
		a = data.left?.path ?? '';
		b = data.right?.path ?? '';
	});

	// Picking a leader triggers the comparison directly. Only navigate when both
	// are picked, they differ, and they differ from the pair already on screen —
	// otherwise every pick would reload and spam history.
	function maybeCompare() {
		if (!a || !b || a === b) return;
		if (a === (data.left?.path ?? '') && b === (data.right?.path ?? '')) return;
		goto(`?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`, { noScroll: true, keepFocus: true });
	}

	const pair = $derived([data.left, data.right]);
	const rows = $derived(
		data.left && data.right
			? [
					{ label: 'Engagement score', values: pair.map((l) => fmt.format(l!.score)) },
					{ label: 'Followers', values: pair.map((l) => fmt.format(l!.followers)) },
					{ label: 'Vote pledges', values: pair.map((l) => fmt.format(l!.pledges)) },
					{ label: 'Public posts', values: pair.map((l) => String(l!.postCount)) },
					{
						label: 'Manifesto delivery',
						values: pair.map((l) => `${l!.delivered}/${l!.pillarCount} delivered`)
					},
					{ label: 'Status', values: pair.map((l) => l!.status) },
					{ label: 'Verified', values: pair.map((l) => (l!.verified ? '✓ yes' : 'no')) }
				]
			: []
	);
</script>

<svelte:head>
	<title>Compare Leaders — leaders.ke</title>
	<meta
		name="description"
		content="Compare Leaders. A candidate vs current, same seat across regions, same seat across regimes..."
	/>
</svelte:head>

<section class="mx-auto max-w-7xl px-4 py-14 sm:px-6">
	<div class="">
		<h1 class="text-3xl font-extrabold tracking-tight text-heading sm:text-4xl">Compare Leaders</h1>
		<p class="mt-3 text-base leading-relaxed">
			Pick any two leaders - a candidate vs current, same seat across regions, same seat across regimes...
		</p>
	</div>

	<!-- Picker: two leaders-only quick searches; picking either updates the ?a/?b URL -->
	<div class="mt-8 flex flex-wrap items-end gap-3">
		<div class="min-w-0 flex-1">
			<span class="text-sm font-medium text-heading">Leader A</span>
			<div class="mt-1.5">
				<QuickSearch
					include={['Executive', 'Parliament', 'MCAs']}
					expand={false}
					placeholder={data.left?.name ?? 'Find leader A…'}
					onPick={(item) => {
						a = item.path;
						maybeCompare();
					}}
				/>
			</div>
		</div>
		<div class="min-w-0 flex-1">
			<span class="text-sm font-medium text-heading">Leader B</span>
			<div class="mt-1.5">
				<QuickSearch
					include={['Executive', 'Parliament', 'MCAs']}
					expand={false}
					placeholder={data.right?.name ?? 'Find leader B…'}
					onPick={(item) => {
						b = item.path;
						maybeCompare();
					}}
				/>
			</div>
		</div>
	</div>

	{#if data.left && data.right}
		<!-- Header cards: large LeaderCard variant (card-height photo, bio on the right) -->
		<div class="mt-10 grid gap-4 sm:grid-cols-2">
			{#each pair as leader (leader!.path)}
				<LeaderCard
					large
					path={leader!.path}
					name={leader!.name}
					initials={leader!.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
					photoUrl={leader!.photoUrl}
					verified={leader!.verified}
					party={leader!.party}
					partyPath={leader!.partyPath}
					positionTitle={leader!.positionTitle}
					region={leader!.regionLabel}
					status={leader!.status}
					bio={leader!.bio}
				/>
			{/each}
		</div>

		<!-- Metric rows -->
		<div class="mt-6 overflow-x-auto rounded-2xl border border-border">
			<table class="w-full min-w-120 table-fixed border-collapse text-left">
				<thead>
					<tr class="bg-surface-2">
						<th class="w-2/5 px-4 py-3 text-sm font-semibold text-heading">Metric</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">{data.left.name}</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">{data.right.name}</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row.label)}
						<tr class="border-t border-border">
							<th class="px-4 py-3 text-sm font-medium text-heading">{row.label}</th>
							{#each row.values as value, i (i)}
								<td class="px-4 py-3 text-sm capitalize">{value}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Manifesto pillars side by side -->
		<div class="mt-6 grid gap-4 sm:grid-cols-2">
			{#each pair as leader (leader!.path)}
				<div class="rounded-2xl border border-border bg-surface p-6">
					<h3 class="font-semibold text-heading">{leader!.name}'s pillars</h3>
					{#if leader!.pillars.length > 0}
						<ol class="mt-3 space-y-2">
							{#each leader!.pillars as pillar, i (pillar.title)}
								<li class="text-sm">
									<span class="font-medium text-heading">{i + 1}. {pillar.title}</span>
									<span class="text-xs text-muted"> ({pillar.deliveryStatus === 'in_progress' ? 'in progress' : pillar.deliveryStatus})</span>
								</li>
							{/each}
						</ol>
					{:else}
						<p class="mt-3 text-sm text-muted">No manifesto published.</p>
					{/if}
				</div>
			{/each}
		</div>
	{:else}
		<div class="mt-10 rounded-2xl border border-dashed border-border p-10 text-center">
			<p class="font-semibold text-heading">Pick two leaders to compare</p>
			<p class="mx-auto mt-2 max-w-md text-sm text-muted">
				Try a governor against a neighbouring governor, or an current against their challenger.
			</p>
		</div>
	{/if}
</section>
