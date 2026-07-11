<script lang="ts">
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
	<title>Compare leaders — leaders.ke</title>
	<meta
		name="description"
		content="Compare any two Kenyan leaders or 2027 candidates side by side: governor to governor across regions, or the same seat across regimes."
	/>
</svelte:head>

<section class="mx-auto max-w-7xl px-4 py-14 sm:px-6">
	<div class="">
		<h1 class="text-3xl font-extrabold tracking-tight text-heading sm:text-4xl">Compare leaders</h1>
		<p class="mt-3 text-base leading-relaxed">
			Governor to governor across regions, or the same seat across regimes. Pick any two.
		</p>
	</div>

	<!-- Picker: plain GET form so comparisons are shareable URLs -->
	<form method="get" class="mt-8 flex flex-wrap items-end gap-3">
		<label class="block min-w-0 flex-1 sm:max-w-xs">
			<span class="text-sm font-medium text-heading">Leader A</span>
			<select
				name="a"
				bind:value={a}
				class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
			>
				<option value="" disabled>Select a leader</option>
				{#each data.options as option (option.path)}
					<option value={option.path}>{option.label}</option>
				{/each}
			</select>
		</label>
		<label class="block min-w-0 flex-1 sm:max-w-xs">
			<span class="text-sm font-medium text-heading">Leader B</span>
			<select
				name="b"
				bind:value={b}
				class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
			>
				<option value="" disabled>Select a leader</option>
				{#each data.options as option (option.path)}
					<option value={option.path}>{option.label}</option>
				{/each}
			</select>
		</label>
		<button
			type="submit"
			class="rounded-full bg-primary px-6 py-2.5 font-semibold text-on-primary transition hover:brightness-95"
		>
			Compare
		</button>
	</form>

	{#if data.left && data.right}
		<!-- Header cards -->
		<div class="mt-10 grid gap-4 sm:grid-cols-2">
			{#each pair as leader (leader!.path)}
				<a
					href={leader!.path}
					class="group rounded-2xl border border-border bg-surface p-6 transition hover:border-primary"
				>
					<h2 class="text-lg font-bold text-heading group-hover:text-primary">
						{leader!.name}{#if leader!.verified}<span class="ml-1 text-primary">✓</span>{/if}
					</h2>
					<p class="mt-1 text-sm text-muted">
						{leader!.positionTitle}, {leader!.regionLabel}
						{#if leader!.party}· {leader!.party}{/if}
					</p>
					{#if leader!.bio}
						<p class="mt-3 text-sm leading-relaxed">{leader!.bio.slice(0, 180)}{leader!.bio.length > 180 ? '…' : ''}</p>
					{/if}
				</a>
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
