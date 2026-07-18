<script lang="ts">
	// Single-select pill bar for position filtering (leaders directory, rank pages),
	// matching the pricing page's office selector. The component owns Kenya's
	// elective hierarchy order and the abbreviated mobile labels - callers just
	// pass whichever positions actually have people. Two modes:
	//  - filter (default): clicking a pill sets the bindable `value`.
	//  - links (`hrefFor` set): each pill is an <a> to its own page (e.g.
	//    /rank/governors), `value` only marks the active one; no "All" pill.
	let {
		positions,
		value = $bindable(''),
		hrefFor
	}: {
		positions: string[];
		value?: string;
		/** Link mode: pill hrefs by position title; omit for filter mode. */
		hrefFor?: (position: string) => string;
	} = $props();

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
	// The clear-filter "All" pill sits last, per ORDER — filter mode only (each
	// link-mode pill is a whole page; there is no "all positions" page).
	const ordered = $derived([...[...positions].sort((a, b) => rank(a) - rank(b)), ...(hrefFor ? [] : [''])]);

	const pillClass = (p: string) =>
		`flex-1 rounded-full px-2.5 py-1.5 text-center text-sm font-semibold whitespace-nowrap transition sm:flex-none sm:px-4 ${
			value === p ? 'bg-primary text-on-primary' : 'text-muted hover:text-heading'
		}`;
</script>

{#snippet label(p: string)}
	{#if p !== '' && SHORT[p]}
		<span class="lg:hidden">{SHORT[p]}</span>
		<span class="hidden lg:inline">{p}</span>
	{:else}
		{p === '' ? 'All' : p}
	{/if}
{/snippet}

<!-- Full-width on mobile (pills share the row evenly); shrink-to-fit from sm up,
     where min-w-0 keeps the bar shrinkable inside a flex row (scrolls, not wraps). -->
<div class="w-full min-w-0 overflow-x-auto sm:w-auto sm:max-w-full">
	<div
		class="mx-auto flex w-full items-center rounded-full border border-border bg-surface-2 p-0.5 sm:w-max sm:gap-1 sm:p-1"
		role="group"
		aria-label="Position"
	>
		{#each ordered as p (p)}
			{#if hrefFor}
				<!-- Hover-preload so a pill's page is usually already fetched on click. -->
				<a
					href={hrefFor(p)}
					data-sveltekit-preload-data="hover"
					aria-current={value === p ? 'page' : undefined}
					class={pillClass(p)}
				>
					{@render label(p)}
				</a>
			{:else}
				<button type="button" aria-pressed={value === p} onclick={() => (value = p)} class={pillClass(p)}>
					{@render label(p)}
				</button>
			{/if}
		{/each}
	</div>
</div>
