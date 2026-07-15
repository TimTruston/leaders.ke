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
		invalidClass = ''
	}: {
		value?: string;
		name: string;
		rows?: number;
		placeholder?: string;
		required?: boolean;
		invalidClass?: string;
	} = $props();

	let textarea: HTMLTextAreaElement | undefined = $state();
	let preview = $state(false);

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
		<textarea
			bind:this={textarea}
			bind:value
			{name}
			{rows}
			{placeholder}
			{required}
			class="w-full rounded-b-xl bg-transparent px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:ring-0 focus:outline-none"
		></textarea>
	{/if}
</div>
