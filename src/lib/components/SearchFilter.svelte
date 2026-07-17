<script lang="ts">
	import { counties } from '$lib/data/geo';

	let {
		lockTitle,
		regions,
		parties,
		region = $bindable(''),
		party = $bindable(''),
		status = $bindable(''),
		hasFilters,
		onClear
	}: {
		lockTitle: string;
		regions: string[];
		parties: string[];
		region?: string;
		party?: string;
		// '' means both; every listed leader is already verified, so the only
		// remaining status split worth filtering on is current vs. aspirant.
		status?: '' | 'current' | 'aspirant';
		hasFilters: boolean;
		onClear: () => void;
	} = $props();

	const pillSelect =
		'rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none';

	// MCA seats are wards (1,450 of them) — too many to pick directly, so filter by
	// constituency instead; the caller matches each MCA leader by their ward's
	// parent constituency. Only constituencies that actually have a listed MCA show.
	const allConstituencies = counties
		.flatMap((c) => c.constituencies)
		.toSorted((a, b) => a.seatName.localeCompare(b.seatName));

	const constituencyOptions = $derived(
		allConstituencies.filter((c) => c.wards.some((w) => regions.includes(w.seatName)))
	);
</script>

{#if lockTitle === 'MCA'}
	<select bind:value={region} class={pillSelect} aria-label="Constituency">
		<option value="">All constituencies</option>
		{#each constituencyOptions as c (c.seatName)}
			<option value={c.seatName}>{c.seatName}</option>
		{/each}
	</select>
{:else if lockTitle !== 'President'}
	<select bind:value={region} class={pillSelect} aria-label="Region">
		<option value="">All regions</option>
		{#each regions as r (r)}
			<option value={r}>{r}</option>
		{/each}
	</select>
{/if}

<select bind:value={party} class={pillSelect} aria-label="Party">
	<option value="">All parties</option>
	{#each parties as p (p)}
		<option value={p}>{p}</option>
	{/each}
</select>

<div class="flex items-center gap-1 rounded-full border border-border bg-surface-2 p-1" role="group" aria-label="Status">
	{#each (['current', 'aspirant'] as const) as s (s)}
		<button
			type="button"
			aria-pressed={status === s}
			onclick={() => (status = status === s ? '' : s)}
			class="rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition {status === s
				? 'bg-primary text-on-primary'
				: 'text-muted hover:text-heading'}"
		>
			{s}
		</button>
	{/each}
</div>

{#if hasFilters}
	<button
		type="button"
		onclick={onClear}
		class="px-2 py-2 text-sm font-medium text-muted transition hover:text-heading"
	>
		Clear
	</button>
{/if}
