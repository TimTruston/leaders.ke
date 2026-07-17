<script lang="ts">
	// Single-select pill bar for position filtering (leaders directory, ranks),
	// matching the pricing page's office selector. The component owns Kenya's
	// elective hierarchy order and the abbreviated mobile labels - callers just
	// pass whichever positions actually have people.
	let {
		positions,
		value = $bindable(''),
	}: { positions: string[]; value?: string; } = $props();

	// National to ward; unknown titles keep their incoming order at the end.
	const ORDER = ['President', 'Governor', 'Senator', 'MP', 'Woman Rep', 'MCA'];
	const SHORT: Record<string, string> = {
		President: 'Prs',
		Governor: 'Gov',
		Senator: 'Sen',
		MP: 'MP',
		'Woman Rep': 'WRp',
		MCA: 'MCA',
	};
	const rank = (p: string) => {
		const i = ORDER.indexOf(p);
		return i === -1 ? ORDER.length : i;
	};
	// The clear-filter "All" pill sits last, per ORDER.
	const ordered = $derived([...[...positions].sort((a, b) => rank(a) - rank(b)), ...['']]);
</script>

<!-- Full-width on mobile (pills share the row evenly); shrink-to-fit from sm up,
     where min-w-0 keeps the bar shrinkable inside a flex row (scrolls, not wraps). -->
<div class="w-full min-w-0 overflow-x-auto sm:w-auto sm:max-w-full">
	<div
		class="mx-auto flex w-full items-center rounded-full border border-border bg-surface-2 p-0.5 sm:w-max sm:gap-1 sm:p-1"
		role="group"
		aria-label="Position"
	>
		{#each ordered as p (p)}
			<button
				type="button"
				aria-pressed={value === p}
				onclick={() => (value = p)}
				class="flex-1 rounded-full px-2.5 py-1.5 text-center text-sm font-semibold whitespace-nowrap transition sm:flex-none sm:px-4 {value === p
					? 'bg-primary text-on-primary'
					: 'text-muted hover:text-heading'}"
			>
				{#if p !== '' && SHORT[p]}
					<span class="sm:hidden">{SHORT[p]}</span>
					<span class="hidden sm:inline">{p}</span>
				{:else}
					{p === '' ? 'All' : p}
				{/if}
			</button>
		{/each}
	</div>
</div>
