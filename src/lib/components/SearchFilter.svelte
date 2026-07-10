<script lang="ts">
	import { counties } from '$lib/data/geo';

	let {
		lockTitle,
		regions,
		parties,
		region = $bindable(''),
		party = $bindable(''),
		verifiedOnly = $bindable(false),
		hasFilters,
		onClear
	}: {
		lockTitle: string;
		regions: string[];
		parties: string[];
		region?: string;
		party?: string;
		verifiedOnly?: boolean;
		hasFilters: boolean;
		onClear: () => void;
	} = $props();

	const pillSelect =
		'rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-heading focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none';

	// MCA seats are wards (1,450 of them) — too many to pick directly, so drill
	// down constituency -> ward instead of one flat region list.
	const allConstituencies = counties
		.flatMap((c) => c.constituencies)
		.toSorted((a, b) => a.seatName.localeCompare(b.seatName));

	let selectedConstituency = $state('');
	const constituencyOptions = $derived(
		allConstituencies.filter((c) => c.wards.some((w) => regions.includes(w.seatName)))
	);
	const wardOptions = $derived(
		(allConstituencies.find((c) => c.seatName === selectedConstituency)?.wards ?? [])
			.filter((w) => regions.includes(w.seatName))
			.toSorted((a, b) => a.name.localeCompare(b.name))
	);

	// The locked role and its region change out from under this component when the
	// caller switches position badge — drop the stale constituency picked for the old role.
	$effect(() => {
		lockTitle;
		selectedConstituency = '';
	});
</script>

{#if lockTitle === 'MCA'}
	<select bind:value={selectedConstituency} class={pillSelect} aria-label="Constituency">
		<option value="">All constituencies</option>
		{#each constituencyOptions as c (c.seatName)}
			<option value={c.seatName}>{c.seatName}</option>
		{/each}
	</select>
	<select
		bind:value={region}
		class={pillSelect}
		aria-label="Ward"
		disabled={!selectedConstituency}
	>
		<option value="">All wards</option>
		{#each wardOptions as w (w.seatName)}
			<option value={w.seatName}>{w.name}</option>
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

<button
	type="button"
	aria-pressed={verifiedOnly}
	onclick={() => (verifiedOnly = !verifiedOnly)}
	class="rounded-full border px-4 py-2 text-sm font-semibold transition {verifiedOnly
		? 'border-primary bg-primary text-on-primary'
		: 'border-border bg-surface text-heading hover:bg-surface-2'}"
>
	Verified only
</button>

{#if hasFilters}
	<button
		type="button"
		onclick={onClear}
		class="px-2 py-2 text-sm font-medium text-muted transition hover:text-heading"
	>
		Clear
	</button>
{/if}
