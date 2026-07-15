<script module lang="ts">
	export type Column<R> = {
		key: string;
		label: string;
		sortable?: boolean;
		/** Inline editing: clicking the cell swaps in an input; Enter/blur commits via `onedit`. */
		editable?: boolean;
		/** Cell text when the raw value shouldn't render as-is (dates, fallbacks). */
		format?: (value: unknown, row: R) => string;
	};
</script>

<script lang="ts" generics="Row extends { id: number | string }">
	// Reusable table: sortable headers, a search box, optional inline cell editing,
	// and the shared pager. Search and sort act on the rows already loaded (the
	// current server page) — pass `total`/`page`/`pageSize`/`pagerHref` and the
	// pager handles crossing pages. Svelte-native on purpose: a DOM-owning table
	// library (simple-datatables & co) would fight both Svelte's rendering and the
	// platform's server-side pageSize setting.
	import type { Snippet } from 'svelte';
	import Pagination from '$lib/components/admin/Pagination.svelte';

	let {
		columns,
		rows,
		searchable = true,
		itemLabel = 'rows',
		total,
		page,
		pageSize,
		pagerHref,
		onedit,
		cell,
		empty
	}: {
		columns: Column<Row>[];
		rows: Row[];
		searchable?: boolean;
		itemLabel?: string;
		/** Provide all four to render the pager; omit for standalone client-only tables. */
		total?: number;
		page?: number;
		pageSize?: number;
		pagerHref?: (page: number) => string;
		/** Commits an inline edit. Return false (or throw) to reject and keep the old value. */
		onedit?: (row: Row, key: string, value: string) => void | boolean | Promise<void | boolean>;
		/** Optional custom cell renderer; fall through to text when it doesn't handle a column. */
		cell?: Snippet<[{ row: Row; column: Column<Row>; value: unknown }]>;
		empty?: Snippet;
	} = $props();

	let query = $state('');
	let sortKey = $state<string | null>(null);
	let sortDir = $state<1 | -1>(1);

	// null-safe field read; rows are plain records behind the Row generic.
	const raw = (row: Row, key: string) => (row as Record<string, unknown>)[key];
	const text = (row: Row, column: Column<Row>) => {
		const value = raw(row, column.key);
		if (column.format) return column.format(value, row);
		return value === null || value === undefined || value === '' ? '—' : String(value);
	};

	const visible = $derived.by(() => {
		const q = query.trim().toLowerCase();
		let out = q
			? rows.filter((row) => columns.some((c) => text(row, c).toLowerCase().includes(q)))
			: [...rows];
		if (sortKey) {
			const column = columns.find((c) => c.key === sortKey);
			if (column) {
				out.sort((a, b) => {
					const va = raw(a, sortKey!);
					const vb = raw(b, sortKey!);
					if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sortDir;
					return text(a, column).localeCompare(text(b, column)) * sortDir;
				});
			}
		}
		return out;
	});

	function toggleSort(column: Column<Row>) {
		if (!column.sortable) return;
		if (sortKey === column.key) {
			if (sortDir === 1) sortDir = -1;
			else (sortKey = null), (sortDir = 1); // third click clears back to server order
		} else {
			sortKey = column.key;
			sortDir = 1;
		}
	}

	// Inline editing: one cell at a time, keyed "rowId:columnKey".
	let editing = $state<string | null>(null);
	let draft = $state('');

	function startEdit(row: Row, column: Column<Row>) {
		if (!column.editable || !onedit) return;
		editing = `${row.id}:${column.key}`;
		const value = raw(row, column.key);
		draft = value === null || value === undefined ? '' : String(value);
	}

	async function commitEdit(row: Row, column: Column<Row>) {
		if (editing !== `${row.id}:${column.key}`) return;
		editing = null;
		const value = raw(row, column.key);
		const before = value === null || value === undefined ? '' : String(value);
		if (draft === before) return;
		await onedit?.(row, column.key, draft);
	}
</script>

<div class="flex items-center justify-between">
{#if searchable}
	<input
		type="search"
		bind:value={query}
		placeholder="Search {itemLabel}…"
		aria-label="Search {itemLabel}"
		class="mb-3 w-full max-w-xs rounded-full border border-border bg-surface px-4 py-2 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
	/>
{/if}

<p class="text-muted mr-2">Total: {total}</p>
</div>

<div class="overflow-x-auto rounded-2xl border border-border">
	<table class="w-full border-collapse text-left">
		<thead>
			<tr class="bg-surface-2">
				{#each columns as column (column.key)}
					<th class="px-4 py-3 text-sm font-semibold text-heading">
						{#if column.sortable}
							<button
								type="button"
								onclick={() => toggleSort(column)}
								class="inline-flex items-center gap-1 hover:text-primary"
							>
								{column.label}
								<span class="text-xs text-muted">
									{sortKey === column.key ? (sortDir === 1 ? '▲' : '▼') : '↕'}
								</span>
							</button>
						{:else}
							{column.label}
						{/if}
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each visible as row (row.id)}
				<tr class="border-t border-border">
					{#each columns as column (column.key)}
						{#if column.editable && onedit && editing === `${row.id}:${column.key}`}
							<td class="px-2 py-1.5">
								<!-- svelte-ignore a11y_autofocus -->
								<input
									type="text"
									bind:value={draft}
									autofocus
									onblur={() => commitEdit(row, column)}
									onkeydown={(e) => {
										if (e.key === 'Enter') commitEdit(row, column);
										if (e.key === 'Escape') editing = null;
									}}
									class="w-full rounded-lg border border-primary bg-surface px-2 py-1.5 text-sm text-heading focus:ring-0 focus:outline-none"
								/>
							</td>
						{:else if column.editable && onedit}
							<td
								class="cursor-pointer px-4 py-3 text-sm text-heading hover:bg-surface-2"
								title="Click to edit"
								onclick={() => startEdit(row, column)}
							>
								{text(row, column)}
							</td>
						{:else}
							<td class="px-4 py-3 text-sm text-heading">
								{#if cell}
									{@render cell({ row, column, value: raw(row, column.key) })}
								{:else}
									{text(row, column)}
								{/if}
							</td>
						{/if}
					{/each}
				</tr>
			{:else}
				<tr>
					<td colspan={columns.length} class="px-4 py-6 text-center text-sm text-muted">
						{#if empty}{@render empty()}{:else}Nothing {query ? 'matches your search' : 'here yet'}.{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

{#if total !== undefined && page !== undefined && pageSize !== undefined && pagerHref}
	<Pagination {page} totalPages={Math.max(1, Math.ceil(total / pageSize))} {total} {itemLabel} href={pagerHref} />
{/if}
