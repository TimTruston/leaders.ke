<script lang="ts">
	let {
		pillarOptions,
		rating = $bindable(''),
		pillarTitle = $bindable(''),
		sortBy = $bindable('recent'),
		sortDir = $bindable('desc')
	}: {
		pillarOptions: { id: number; title: string }[];
		rating?: number | '';
		pillarTitle?: string;
		sortBy?: 'recent' | 'likes';
		sortDir?: 'asc' | 'desc';
	} = $props();

	const selectClass =
		'rounded-full border border-border bg-surface pl-4 pr-6 py-2 text-xs font-medium text-muted focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none';
</script>

<div class="flex flex-wrap items-center gap-2">
	<select bind:value={rating} aria-label="Rating" class={selectClass}>
		<option value="">All ratings</option>
		{#each [5, 4, 3, 2, 1] as n (n)}
			<option value={n}>{'★'.repeat(n)}</option>
		{/each}
	</select>

	{#if pillarOptions.length > 0}
		<select bind:value={pillarTitle} aria-label="Pillar" class={selectClass}>
			<option value="">All pillars</option>
			{#each pillarOptions as p (p.id)}
				<option value={p.title}>{p.title}</option>
			{/each}
		</select>
	{/if}

	<select bind:value={sortBy} aria-label="Sort by" class={selectClass}>
		<option value="recent">Most recent</option>
		<option value="likes">Most liked</option>
	</select>

	<button
		type="button"
		onclick={() => (sortDir = sortDir === 'desc' ? 'asc' : 'desc')}
		aria-label={sortDir === 'desc' ? 'Descending' : 'Ascending'}
		class="rounded-full border border-border bg-surface px-3 py-2 text-xs font-medium text-muted transition hover:bg-surface-2"
	>
		{sortDir === 'desc' ? '↓' : '↑'}
	</button>
</div>
