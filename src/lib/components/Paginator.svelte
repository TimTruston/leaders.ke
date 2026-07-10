<script lang="ts">
	let { page = $bindable(), totalPages }: { page: number; totalPages: number } = $props();

	// Always show first, last, current ±1; collapse the rest into an ellipsis.
	const pageNumbers = $derived.by(() => {
		const pages: (number | '…')[] = [];
		for (let p = 1; p <= totalPages; p++) {
			if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) {
				pages.push(p);
			} else if (pages[pages.length - 1] !== '…') {
				pages.push('…');
			}
		}
		return pages;
	});
</script>

{#if totalPages > 1}
	<div class="mt-4 flex flex-wrap items-center justify-center gap-2">
		<button
			type="button"
			disabled={page === 1}
			onclick={() => (page = Math.max(1, page - 1))}
			class="rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-heading transition hover:bg-surface-2 disabled:opacity-40"
		>
			← Previous
		</button>

		{#each pageNumbers as p, i (i)}
			{#if p === '…'}
				<span class="px-1 text-sm text-muted">…</span>
			{:else}
				<button
					type="button"
					onclick={() => (page = p)}
					aria-current={p === page ? 'page' : undefined}
					class="size-9 rounded-full text-sm font-medium transition {p === page
						? 'bg-primary text-on-primary'
						: 'border border-border bg-surface text-heading hover:bg-surface-2'}"
				>
					{p}
				</button>
			{/if}
		{/each}

		<button
			type="button"
			disabled={page === totalPages}
			onclick={() => (page = Math.min(totalPages, page + 1))}
			class="rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-heading transition hover:bg-surface-2 disabled:opacity-40"
		>
			Next →
		</button>
	</div>
{/if}
