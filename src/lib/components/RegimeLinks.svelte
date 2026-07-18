<script lang="ts">
	// Regime line: subtle year-range links (the /leaders era-filter styling);
	// each loads the seat's hub for that regime, the one on screen highlighted.
	let {
		regimes,
		basePath = '',
		hubPath = basePath,
		hrefFor,
		cycle,
		regime,
		hideCurrentYear = false,
		startYearsOnly = false
	}: {
		/** Options from loadSeatHub: the active cycle plus each recorded term. */
		regimes: { year: number; label: string }[];
		/** Base for year links (`${basePath}/${year}`); optional when hrefFor is given. */
		basePath?: string;
		/** The hub itself (the active cycle's link) — differs from basePath on
		 * Country-wide seats (/president vs /presidents/2027). */
		hubPath?: string;
		/** Custom link builder (e.g. ?regime= query links on directories);
		 * overrides basePath/hubPath entirely. */
		hrefFor?: (year: number) => string;
		/** The active election cycle — its link is the hub itself. */
		cycle: number;
		/** The regime currently on screen (highlighted). */
		regime: number;
		/** Hide the active cycle's entry (the "2027" link). */
		hideCurrentYear?: boolean;
		/** Label each regime by its bare start year ("2022") instead of the range ("2022-Now"). */
		startYearsOnly?: boolean;
	} = $props();

	const visible = $derived(regimes.filter((r) => !(hideCurrentYear && r.year === cycle)));
</script>

{#if visible.length > 0}
	<p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
		<span>Regimes:</span>
		{#each visible as r (r.year)}
			<a
				href={hrefFor ? hrefFor(r.year) : r.year === cycle ? hubPath : `${basePath}/${r.year}`}
				class="transition hover:text-heading {r.year === regime
					? 'font-semibold text-primary underline underline-offset-4'
					: ''}"
			>
				{startYearsOnly ? r.year : r.label}
			</a>
		{/each}
	</p>
{/if}
