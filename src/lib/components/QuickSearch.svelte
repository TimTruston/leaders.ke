<script lang="ts">
	// Header quick-jump: a small input that expands over the nav links on focus and
	// autocompletes across six groups - Platform pages and Regions are static and
	// filtered client-side; Executive / Parliament / MCAs / Parties come from
	// /api/quick-search as you type. Enter opens the highlighted (or first) result.
	import { goto } from '$app/navigation';
	import { counties, geoSlug } from '$lib/data/geo';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	type Item = { label: string; sub: string; path: string };
	type Group = { name: string; items: Item[] };

	const PLATFORM: Item[] = [
		{ label: 'All Leaders', sub: 'Platform', path: '/leaders' },
		{ label: 'Leaders Rank', sub: 'Platform', path: '/ranks' },
		{ label: 'Compare Leaders', sub: 'Platform', path: '/compare' },
		{ label: '2027 Vote Simulator', sub: 'Platform', path: '/vote/2027' },
		{ label: 'Parties, Alliances & Movements', sub: 'Platform', path: '/parties' },
	];

	// Regions: counties, constituencies and wards, each linking to its seat hub.
	const REGIONS: Item[] = counties.flatMap((county) => [
		{ label: county.name, sub: 'County', path: `/governor/${geoSlug(county.name)}` },
		...county.constituencies.flatMap((constituency) => [
			{ label: constituency.name, sub: `Constituency, ${county.name}`, path: `/mp/${geoSlug(constituency.name)}` },
			...constituency.wards.map((ward) => ({
				label: ward.name,
				sub: `Ward, ${constituency.name}`,
				path: `/mca/${geoSlug(ward.name)}`
			}))
		])
	]);

	let query = $state('');
	let highlighted = $state(0);
	let dbGroups = $state<{ executive: Item[]; parliament: Item[]; mcas: Item[]; parties: Item[] }>({
		executive: [],
		parliament: [],
		mcas: [],
		parties: []
	});
	let input = $state<HTMLInputElement | null>(null);

	// Debounced DB lookup; a stale response never overwrites a newer query's.
	let timer: ReturnType<typeof setTimeout> | undefined;
	let requestSeq = 0;
	$effect(() => {
		const q = query.trim();
		clearTimeout(timer);
		if (q.length < 2) {
			dbGroups = { executive: [], parliament: [], mcas: [], parties: [] };
			return;
		}
		const seq = ++requestSeq;
		timer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/quick-search?q=${encodeURIComponent(q)}`);
				if (res.ok && seq === requestSeq) dbGroups = await res.json();
			} catch {
				/* network hiccup: keep whatever is shown */
			}
		}, 200);
	});

	const filterStatic = (items: Item[], q: string) =>
		items.filter((i) => i.label.toLowerCase().includes(q)).slice(0, 5);

	const groups: Group[] = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return [{ name: 'Platform', items: PLATFORM.slice(0, 8) }];
		return [
			{ name: 'Executive', items: dbGroups.executive },
			{ name: 'Parliament', items: dbGroups.parliament },
			{ name: 'MCAs', items: dbGroups.mcas },
			{ name: 'Platform', items: filterStatic(PLATFORM, q) },
			{ name: 'Regions', items: filterStatic(REGIONS, q) },
			{ name: 'Parties', items: dbGroups.parties }
		].filter((g) => g.items.length > 0);
	});
	const flat = $derived(groups.flatMap((g) => g.items));
	$effect(() => {
		flat;
		highlighted = 0;
	});

	function close() {
		open = false;
		query = '';
		input?.blur();
	}

	function pick(item: Item | undefined) {
		if (!item) return;
		close();
		goto(item.path);
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
		else if (e.key === 'ArrowDown') {
			e.preventDefault();
			highlighted = Math.min(highlighted + 1, flat.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			highlighted = Math.max(highlighted - 1, 0);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			pick(flat[highlighted] ?? flat[0]);
		}
	}

	// Index of an item within the flattened list, for highlight comparison.
	function flatIndex(group: Group, i: number): number {
		let n = 0;
		for (const g of groups) {
			if (g === group) return n + i;
			n += g.items.length;
		}
		return -1;
	}
</script>

<svelte:window
	onkeydown={(e) => {
		// "/" focuses the quick search from anywhere outside a form field.
		if (e.key === '/' && !open && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
			e.preventDefault();
			input?.focus();
		}
	}}
/>

<div class="relative {open ? 'w-full max-w-xl' : 'w-28 sm:w-40'} transition-all duration-200">
	<svg
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
	>
		<circle cx="11" cy="11" r="7" /><path stroke-linecap="round" d="m20 20-3.5-3.5" />
	</svg>
	<input
		bind:this={input}
		bind:value={query}
		onfocus={() => (open = true)}
		onblur={() => setTimeout(() => (open = false), 150)}
		onkeydown={onKeydown}
		type="search"
		placeholder={open ? 'Type the name of a leader, region or party…' : 'Search'}
		aria-label="Quick search"
		class="w-full rounded-full border border-border bg-surface py-2 pr-3 pl-9 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:outline-none"
	/>

	{#if open && groups.length > 0}
		<div
			class="absolute top-full left-0 z-50 mt-2 max-h-[70vh] w-full overflow-y-auto rounded-2xl border border-border bg-surface p-2 shadow-lg"
		>
			{#each groups as group (group.name)}
				<p class="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">{group.name}</p>
				{#each group.items as item, i (item.path)}
					<!-- mousedown beats the input's blur-close so the click still lands -->
					<button
						type="button"
						onmousedown={(e) => {
							e.preventDefault();
							pick(item);
						}}
						class="flex w-full items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition {flatIndex(group, i) === highlighted
							? 'bg-primary-soft text-heading'
							: 'text-text hover:bg-surface-2'}"
					>
						<span class="truncate font-medium">{item.label}</span>
						<span class="shrink-0 text-xs text-muted">{item.sub}</span>
					</button>
				{/each}
			{/each}
			{#if query.trim()}
				<button
					type="button"
					onmousedown={(e) => {
						e.preventDefault();
						const q = query.trim();
						close();
						goto(`/search?q=${encodeURIComponent(q)}`);
					}}
					class="mt-1 w-full rounded-lg border-t border-border px-3 py-2 text-left text-xs text-muted hover:bg-surface-2"
				>
					Search everything for "{query.trim()}"
				</button>
			{/if}
		</div>
	{/if}
</div>
