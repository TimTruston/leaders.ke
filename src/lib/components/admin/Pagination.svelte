<script lang="ts">
	let {
		page,
		totalPages,
		total,
		itemLabel = 'items',
		href
	}: { page: number; totalPages: number; total: number; itemLabel?: string; href: (page: number) => string } =
		$props();
</script>

{#if totalPages > 1}
	<div class="mt-4 flex items-center justify-between gap-3 text-sm">
		<span class="text-muted">Page {page} of {totalPages} ({total} {itemLabel})</span>
		<div class="flex gap-2">
			<a
				href={href(page - 1)}
				aria-disabled={page <= 1}
				class="rounded-full border border-border px-3.5 py-1.5 font-semibold text-heading transition hover:bg-surface-2 {page <=
				1
					? 'pointer-events-none opacity-40'
					: ''}"
			>
				Previous
			</a>
			<a
				href={href(page + 1)}
				aria-disabled={page >= totalPages}
				class="rounded-full border border-border px-3.5 py-1.5 font-semibold text-heading transition hover:bg-surface-2 {page >=
				totalPages
					? 'pointer-events-none opacity-40'
					: ''}"
			>
				Next
			</a>
		</div>
	</div>
{/if}
