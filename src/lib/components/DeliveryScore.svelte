<script lang="ts">
	// Public rollup of a leader's manifesto delivery tracker: a two-tone bar
	// (delivered solid, in-progress faded) plus the tally. Renders its own heading
	// and an empty state, so callers just drop it into whatever card/column wraps it.
	let {
		delivered,
		total,
		inProgress = 0,
		heading = 'Delivery score',
		emptyText = 'No manifesto delivery tracked for this seat yet.'
	}: {
		delivered: number;
		total: number;
		inProgress?: number;
		heading?: string;
		emptyText?: string;
	} = $props();

	const deliveredPct = $derived(total > 0 ? Math.round((delivered / total) * 100) : 0);
	const inProgressPct = $derived(total > 0 ? Math.round((inProgress / total) * 100) : 0);
</script>

<h2 class="text-xl font-bold text-heading">{heading}</h2>
{#if total > 0}
	<p class="mt-1 text-sm text-muted">
		{delivered} of {total} manifesto pillars delivered{#if inProgress > 0} · {inProgress} in progress{/if}
	</p>
	<div class="mt-3 flex h-3 overflow-hidden rounded-full bg-surface-2">
		<div class="h-full bg-primary" style="width: {deliveredPct}%"></div>
		<div class="h-full bg-primary/40" style="width: {inProgressPct}%"></div>
	</div>
{:else}
	<p class="mt-4 rounded-2xl border border-border bg-surface-2 p-5 text-sm leading-relaxed text-muted">
		{emptyText}
	</p>
{/if}
