<script lang="ts">
	// Single-select pill bar for position filtering (leaders directory, ranks),
	// matching the pricing page's office selector. The component owns Kenya's
	// elective hierarchy order and the abbreviated mobile labels - callers just
	// pass whichever positions actually have people. `allLabel` prepends an
	// every-position pill bound to the empty string.
	let {
		positions,
		value = $bindable(''),
		allLabel
	}: { positions: string[]; value?: string; allLabel?: string } = $props();

	// National to ward; unknown titles keep their incoming order at the end.
	const ORDER = ['President', 'Governor', 'Senator', 'MP', 'Woman Rep', 'MCA'];
	const SHORT: Record<string, string> = {
		President: 'President',
		Governor: 'Governor',
		Senator: 'Senator',
		MP: 'MP',
		'Woman Rep': 'WRep',
		MCA: 'MCA'
	};
	const rank = (p: string) => {
		const i = ORDER.indexOf(p);
		return i === -1 ? ORDER.length : i;
	};
	const ordered = $derived([...(allLabel ? [''] : []), ...[...positions].sort((a, b) => rank(a) - rank(b))]);
</script>

<!-- min-w-0 keeps the bar shrinkable inside a flex row (it scrolls instead of wrapping) -->
<div class="min-w-0 max-w-full overflow-x-auto">
	<div
		class="mx-auto flex w-max items-center rounded-full border border-border bg-surface-2 p-0.5 sm:gap-1 sm:p-1"
		role="group"
		aria-label="Position"
	>
		{#each ordered as p (p)}
			<button
				type="button"
				aria-pressed={value === p}
				onclick={() => (value = p)}
				class="rounded-full px-2 py-1.5 text-sm font-semibold whitespace-nowrap transition sm:px-4 {value === p
					? 'bg-primary text-on-primary'
					: 'text-muted hover:text-heading'}"
			>
				{#if p !== '' && SHORT[p]}
					<span class="sm:hidden">{SHORT[p]}</span>
					<span class="hidden sm:inline">{p}</span>
				{:else}
					{p === '' ? allLabel : p}
				{/if}
			</button>
		{/each}
	</div>
</div>
