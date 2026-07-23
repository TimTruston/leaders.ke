<script lang="ts">
	import Paginator from './Paginator.svelte';

	type Notification = { id: number; kind: string; title: string; body: string; href: string | null; createdAt: string };

	// The header's round bell button + permanent notification history — same round-button
	// idiom as ThemeToggle, same lazy-fetch-on-open idiom as the account switcher (see
	// Header.svelte's ensureSwitcherData). Nothing here is dismissible: dismissing lives
	// only on the dashboard banner (see dashboard/+layout.svelte); this tab is the full,
	// permanent record across every view (citizen/ambassador/manager/admin all share it —
	// notifications are per-person, not per-campaign).
	let open = $state(false);
	let el: HTMLDetailsElement | undefined = $state();
	let page = $state(1);
	let pageSize = $state(20);
	let total = $state(0);
	let items = $state<Notification[]>([]);
	let unreadCount = $state(0);
	let loading = $state(false);

	const totalPages = $derived(Math.max(1, Math.ceil(total / pageSize)));

	async function load() {
		loading = true;
		try {
			const res = await fetch(`/api/notifications?page=${page}`);
			if (!res.ok) return;
			const data = await res.json();
			items = data.items;
			total = data.total;
			pageSize = data.pageSize;
			unreadCount = data.unreadCount;
		} finally {
			loading = false;
		}
	}

	// Fetch the unread badge once on mount (cheap, worth showing even before the panel
	// is ever opened); refetch the page itself whenever the panel opens or the page changes.
	$effect(() => {
		load();
	});

	$effect(() => {
		if (!open) return;
		const onClick = (e: MouseEvent) => {
			if (el && !el.contains(e.target as Node)) open = false;
		};
		document.addEventListener('click', onClick);
		return () => document.removeEventListener('click', onClick);
	});

	$effect(() => {
		void page;
		if (open) load();
	});
</script>

<details class="group relative w-fit" bind:open bind:this={el}>
	<summary
		aria-label="Notifications"
		class="relative flex size-9 cursor-pointer list-none items-center justify-center rounded-full border border-border bg-surface text-heading transition hover:bg-surface-2"
	>
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-4.5">
			<path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9" />
		</svg>
		{#if unreadCount > 0}
			<span class="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-on-primary">
				{unreadCount > 9 ? '9+' : unreadCount}
			</span>
		{/if}
	</summary>

	<div class="absolute right-0 z-10 mt-2 max-h-[28rem] w-80 overflow-y-auto rounded-2xl border border-border bg-surface p-3 shadow-lg sm:w-96">
		<p class="px-1 pb-2 text-sm font-semibold text-heading">Notifications</p>
		{#if loading && items.length === 0}
			<p class="px-1 py-6 text-center text-sm text-muted">Loading…</p>
		{:else if items.length === 0}
			<p class="px-1 py-6 text-center text-sm text-muted">Nothing here yet.</p>
		{:else}
			<ul class="space-y-2">
				{#each items as item (item.id)}
					<li class="rounded-xl bg-surface-2 p-3 text-sm">
						<p class="font-semibold text-heading">{item.title}</p>
						<p class="mt-0.5 whitespace-pre-line text-muted [&_a]:font-semibold [&_a]:text-primary [&_a]:underline">{@html item.body}</p>
						<p class="mt-1 text-xs text-muted">{new Date(item.createdAt).toLocaleString()}</p>
					</li>
				{/each}
			</ul>
			<Paginator bind:page {totalPages} />
		{/if}
	</div>
</details>
