<script lang="ts">
	// Standalone leader/party search-and-tag field for the News composer — shared
	// verbatim between the create and edit forms (same component, same state
	// shape) so the two can never drift. Picking here only ever produces a chip;
	// it never writes into the post body — only an "@" typed directly into the
	// RichTextEditor inserts an inline link there. A leader chip feeds
	// `tags.subjectUserId` (a real user) on save; a party chip has no user row to
	// tag, so for now it's display-only bookkeeping during the compose session.
	type Suggestion = { kind: 'leader' | 'party'; slug: string; name: string; path: string; sub: string };

	let {
		mentioned = $bindable([]),
		parties = $bindable([]),
		placeholder = 'Mentions: search leaders and parties to tag on this post'
	}: {
		mentioned?: { slug: string; name: string }[];
		parties?: { name: string; path: string }[];
		placeholder?: string;
	} = $props();

	let query = $state('');
	let suggestions = $state<Suggestion[]>([]);
	let searchTimer: ReturnType<typeof setTimeout>;

	function onInput() {
		clearTimeout(searchTimer);
		// Tolerate a leading "@" — the field is a search box, not a trigger, but
		// people reflexively type it since the whole feature reads as "@mention".
		const q = query.trim().replace(/^@/, '');
		if (q.length < 2) {
			suggestions = [];
			return;
		}
		searchTimer = setTimeout(async () => {
			const res = await fetch(`/api/mention-search?q=${encodeURIComponent(q)}`);
			const { results } = await res.json();
			suggestions = (results as Suggestion[]).filter(
				(r) => !(r.kind === 'leader' ? mentioned.some((m) => m.slug === r.slug) : parties.some((p) => p.path === r.path))
			);
		}, 200);
	}
	function pick(s: Suggestion) {
		if (s.kind === 'party') parties.push({ name: s.name, path: s.path });
		else mentioned.push({ slug: s.slug, name: s.name });
		query = '';
		suggestions = [];
	}
	function removeLeader(slug: string) {
		mentioned = mentioned.filter((m) => m.slug !== slug);
	}
	function removeParty(path: string) {
		parties = parties.filter((p) => p.path !== path);
	}
</script>

<div class="relative">
	{#if mentioned.length || parties.length}
		<div class="mb-1.5 flex flex-wrap gap-1.5">
			{#each mentioned as m (m.slug)}
				<span class="flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-on-primary">
					@{m.name}
					<button type="button" onclick={() => removeLeader(m.slug)} class="cursor-pointer leading-none">&times;</button>
				</span>
			{/each}
			{#each parties as p (p.path)}
				<span class="flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-on-primary">
					@{p.name}
					<button type="button" onclick={() => removeParty(p.path)} class="cursor-pointer leading-none">&times;</button>
				</span>
			{/each}
		</div>
	{/if}
	<input
		type="text"
		bind:value={query}
		oninput={onInput}
		{placeholder}
		class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
	/>
	{#if suggestions.length}
		<!-- Normal flow, not absolute: the composer's slide-down wrapper clips
		absolutely-positioned overflow with overflow-hidden (needed for its
		grid-rows transition), so this has to grow the container instead of
		floating over it. -->
		<ul class="mt-1 w-full rounded-xl border border-border bg-surface p-1 shadow-lg">
			{#each suggestions as s (s.kind + s.slug)}
				<li>
					<button
						type="button"
						onclick={() => pick(s)}
						class="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-heading hover:bg-surface-2"
					>
						<span class="block">{s.name}</span>
						<span class="block text-xs text-muted">{s.sub}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
