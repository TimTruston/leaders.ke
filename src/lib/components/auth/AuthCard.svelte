<script lang="ts">
	import type { Snippet } from 'svelte';

	// Card chrome shared by every auth form: title, optional subtitle, body slot, optional footer links.
	interface Props {
		title: string;
		subtitle?: string;
		children: Snippet;
		footer?: Snippet;
	}

	let { title, subtitle, children, footer }: Props = $props();
</script>

<div class="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-sm">
	<h1 class="text-2xl font-bold text-heading">{title}</h1>
	{#if subtitle}
		<p class="mt-1 text-sm text-muted">{subtitle}</p>
	{/if}

	<div class="mt-6">
		{@render children()}
	</div>

	{#if footer}
		<div class="mt-6 border-t border-border pt-4 text-center text-sm text-muted">
			{@render footer()}
		</div>
	{/if}
</div>
