<script lang="ts">
	// Simple rich-text editing over a plain <textarea>: toolbar buttons write the
	// markdown-lite markers renderRichText understands, so what's stored stays
	// human-readable text and the public page renders it formatted. A Preview
	// toggle shows exactly what the profile view will show.
	import { renderRichText } from '$lib/utils/richtext';

	let {
		value = $bindable(''),
		name,
		rows = 6,
		placeholder = '',
		required = false,
		invalidClass = '',
		enableMentions = false
	}: {
		value?: string;
		name: string;
		rows?: number;
		placeholder?: string;
		required?: boolean;
		invalidClass?: string;
		// Typing "@name" searches /api/mention-search and, on pick, replaces it with
		// a real [@Name](/slug) link — dashboard-only (leader search needs the
		// viewer signed in), so off by default for public-facing bios/platforms.
		enableMentions?: boolean;
	} = $props();

	let textarea: HTMLTextAreaElement | undefined = $state();
	let preview = $state(false);

	// Mention autocomplete: tracks the "@query" span currently being typed (start
	// index right after the "@", end index at the caret) so a pick knows exactly
	// what to replace.
	let mentionRange = $state<{ start: number; end: number } | null>(null);
	let mentionSuggestions = $state<{ kind: 'leader' | 'party'; slug: string; name: string; path: string; sub: string }[]>([]);
	let mentionTimer: ReturnType<typeof setTimeout>;

	function onMentionInput() {
		if (!enableMentions || !textarea) return;
		const caret = textarea.selectionStart;
		const uptoCaret = value.slice(0, caret);
		const match = uptoCaret.match(/(?:^|\s)@([a-zA-Z' -]*)$/);
		if (!match) {
			mentionRange = null;
			mentionSuggestions = [];
			return;
		}
		const query = match[1];
		// Include the "@" itself in the replaced span — the picked link's label is
		// plain (no "@"), so leaving the typed "@" out here would double it up.
		mentionRange = { start: caret - query.length - 1, end: caret };
		clearTimeout(mentionTimer);
		if (query.trim().length < 2) {
			mentionSuggestions = [];
			return;
		}
		mentionTimer = setTimeout(async () => {
			const res = await fetch(`/api/mention-search?q=${encodeURIComponent(query.trim())}`);
			const { results } = await res.json();
			mentionSuggestions = results;
		}, 200);
	}

	function pickMention(m: { name: string; path: string }) {
		if (!mentionRange || !textarea) return;
		const { start, end } = mentionRange;
		const link = `[${m.name}](${m.path})`;
		value = value.slice(0, start) + link + value.slice(end);
		const cursor = start + link.length;
		mentionRange = null;
		mentionSuggestions = [];
		requestAnimationFrame(() => {
			textarea?.focus();
			textarea?.setSelectionRange(cursor, cursor);
		});
	}

	// Wraps the selection (or inserts the marker pair at the caret) and restores
	// focus so repeated toolbar clicks keep working on the same spot.
	function wrapSelection(prefix: string, suffix = prefix) {
		if (!textarea) return;
		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		const selected = value.slice(start, end);
		value = value.slice(0, start) + prefix + selected + suffix + value.slice(end);
		const cursor = start + prefix.length;
		requestAnimationFrame(() => {
			textarea?.focus();
			textarea?.setSelectionRange(cursor, cursor + selected.length);
		});
	}

	// Prefixes every line in the selection (or the caret's line) as a list.
	function prefixLines(marker: (i: number) => string) {
		if (!textarea) return;
		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		const lineStart = value.lastIndexOf('\n', start - 1) + 1;
		const lineEnd = end === value.length ? end : value.indexOf('\n', end) === -1 ? value.length : value.indexOf('\n', end);
		const block = value.slice(lineStart, lineEnd);
		const prefixed = block
			.split('\n')
			.map((line, i) => marker(i) + line)
			.join('\n');
		value = value.slice(0, lineStart) + prefixed + value.slice(lineEnd);
		requestAnimationFrame(() => textarea?.focus());
	}

	const buttonClass =
		'grid size-8 place-items-center rounded-lg border border-border bg-surface text-xs font-semibold text-muted transition hover:border-primary hover:text-primary';
</script>

<div class="rounded-xl border bg-surface {invalidClass || 'border-border'} focus-within:border-primary">
	<div class="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
		<button type="button" onclick={() => wrapSelection('**')} title="Bold" aria-label="Bold" class="{buttonClass} font-bold">
			B
		</button>
		<button type="button" onclick={() => wrapSelection('*')} title="Italic" aria-label="Italic" class="{buttonClass} italic">
			I
		</button>
		<button type="button" onclick={() => prefixLines(() => '- ')} title="Bullet list" aria-label="Bullet list" class={buttonClass}>
			•≡
		</button>
		<button
			type="button"
			onclick={() => prefixLines((i) => `${i + 1}. `)}
			title="Numbered list"
			aria-label="Numbered list"
			class={buttonClass}
		>
			1.
		</button>
		<button
			type="button"
			onclick={() => (preview = !preview)}
			aria-pressed={preview}
			class="ml-auto rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition {preview
				? 'border-primary bg-primary-soft text-on-primary'
				: 'border-border text-muted hover:border-primary hover:text-primary'}"
		>
			{preview ? 'Edit' : 'Preview'}
		</button>
	</div>

	{#if preview}
		<!-- Same renderer as the public profile page, so the preview is faithful. -->
		<div class="space-y-3 px-4 py-2.5 text-sm leading-relaxed text-heading" style="min-height: {rows * 1.6}em">
			{#if value.trim()}
				{@html renderRichText(value)}
			{:else}
				<p class="text-muted">Nothing to preview yet.</p>
			{/if}
		</div>
		<!-- Keep submitting the raw text while previewing. -->
		<input type="hidden" {name} {value} />
	{:else}
		<div class="relative">
			<textarea
				bind:this={textarea}
				bind:value
				oninput={onMentionInput}
				onclick={onMentionInput}
				{name}
				{rows}
				{placeholder}
				{required}
				class="w-full rounded-b-xl bg-transparent px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:ring-0 focus:outline-none"
			></textarea>
			{#if mentionSuggestions.length}
				<!-- Normal flow, not absolute: an ancestor composer wrapper clips
				absolutely-positioned overflow (needed for its own slide-down grid-rows
				transition), so this has to grow the container instead of floating over it. -->
				<ul class="mx-2 mb-2 rounded-xl border border-border bg-surface p-1 shadow-lg">
					{#each mentionSuggestions as m (m.kind + m.slug)}
						<li>
							<button
								type="button"
								onclick={() => pickMention(m)}
								class="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-heading hover:bg-surface-2"
							>
								<span>
									<span class="block">@{m.name}</span>
									<span class="block text-xs text-muted">{m.sub}</span>
								</span>
								<span class="shrink-0 text-xs text-muted">{m.kind === 'party' ? 'Party' : 'Leader'}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>
