<script lang="ts">
	import { counties } from '$lib/data/geo';

	type Position = { id: number; title: string; region: string };

	let {
		positions,
		verified,
		initialPositionId,
		name = 'positionId',
		label = 'Elective position',
		required = true,
		value = $bindable('')
	}: {
		positions: Position[];
		verified: boolean;
		initialPositionId: number | null;
		name?: string;
		label?: string;
		// false when this selector lives in a shared <form> alongside other submit
		// buttons — native HTML validation is form-wide, so an always-required select
		// here would block unrelated submits (e.g. the main Save button) until filled.
		required?: boolean;
		// Exposes the chosen positionId to the parent (e.g. to stage it client-side
		// instead of relying on native form submission).
		value?: number | '';
	} = $props();

	// National ballot order, not alphabetical.
	const TITLE_ORDER = ['President', 'Governor', 'Senator', 'Woman Rep', 'MP', 'MCA'];
	const titles = $derived(
		[...new Set(positions.map((p) => p.title))].sort(
			(a, b) => TITLE_ORDER.indexOf(a) - TITLE_ORDER.indexOf(b)
		)
	);

	const initialPosition = positions.find((p) => p.id === initialPositionId);
	let selectedTitle = $state(initialPosition?.title ?? '');
	value = initialPositionId ?? '';

	// MCA seats are wards (1,450 of them) — too many to pick directly, so drill down
	// constituency -> ward instead of one flat region list, same as every other role.
	const allConstituencies = counties
		.flatMap((c) => c.constituencies)
		.toSorted((a, b) => a.seatName.localeCompare(b.seatName));
	let selectedConstituency = $state(
		selectedTitle === 'MCA'
			? (allConstituencies.find((c) => c.wards.some((w) => w.seatName === initialPosition?.region))
					?.seatName ?? '')
			: ''
	);

	const regionOptions = $derived(
		positions.filter((p) => p.title === selectedTitle).toSorted((a, b) => a.region.localeCompare(b.region))
	);
	const wardOptions = $derived(
		(allConstituencies.find((c) => c.seatName === selectedConstituency)?.wards ?? []).toSorted(
			(a, b) => a.name.localeCompare(b.name)
		)
	);

	function onTitleChange() {
		// Downstream selects change with the role; their old values no longer apply.
		selectedConstituency = '';
		// President is a single national seat — auto-pick it, no region step needed.
		value = selectedTitle === 'President' ? (regionOptions[0]?.id ?? '') : '';
	}

	function onConstituencyChange() {
		value = '';
	}
</script>

<div class="flex flex-col w-full">
	<span class="text-sm font-medium text-heading">{label}</span>
	{#if verified}
		<p class="mt-1.5 rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-muted">
			Your seat is locked while verified. Contact support to change races.
		</p>
		<input type="hidden" {name} value={initialPositionId} />
	{:else}
		<div class="mt-1.5 flex gap-3">
			<select
				bind:value={selectedTitle}
				onchange={onTitleChange}
				{required}
				class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
			>
				<option value="" disabled>Leadership role</option>
				{#each titles as title (title)}
					<option value={title}>{title}</option>
				{/each}
			</select>

			{#if selectedTitle === 'MCA'}
				<select
					bind:value={selectedConstituency}
					onchange={onConstituencyChange}
					{required}
					disabled={!selectedTitle}
					class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none disabled:opacity-60"
				>
					<option value="" disabled>Select Constituency</option>
					{#each allConstituencies as c (c.seatName)}
						<option value={c.seatName}>{c.seatName}</option>
					{/each}
				</select>
				<select
					bind:value={value}
					{required}
					disabled={!selectedConstituency}
					class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none disabled:opacity-60"
				>
					<option value="" disabled>Select Ward</option>
					{#each wardOptions as w (w.seatName)}
						<option value={positions.find((p) => p.title === 'MCA' && p.region === w.seatName)?.id ?? ''}>
							{w.name}
						</option>
					{/each}
				</select>
			{:else if selectedTitle && selectedTitle !== 'President'}
				<select
					{name}
					bind:value={value}
					{required}
					disabled={!selectedTitle}
					class="col-span-2 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none disabled:opacity-60"
				>
					<option value="" disabled>Select Region</option>
					{#each regionOptions as p (p.id)}
						<option value={p.id}>{p.region}</option>
					{/each}
				</select>
			{/if}
		</div>
		{#if selectedTitle === 'MCA' || selectedTitle === 'President'}
			<input type="hidden" {name} value={value} />
		{/if}
	{/if}
</div>
