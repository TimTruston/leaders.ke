<script lang="ts">
	// Confirmation modal for destructive actions (e.g. deleting an application or
	// claim). Escape and the backdrop cancel; the confirm button is the destructive one.
	let {
		title,
		body,
		confirmLabel = 'Delete',
		onconfirm,
		oncancel
	}: {
		title: string;
		body: string;
		confirmLabel?: string;
		onconfirm: () => void;
		oncancel: () => void;
	} = $props();
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && oncancel()} />

<div class="fixed inset-0 z-50 grid place-items-center p-4">
	<button type="button" aria-label="Cancel" onclick={oncancel} class="absolute inset-0 bg-black/70"></button>
	<div role="alertdialog" aria-modal="true" aria-label={title} class="relative w-full max-w-md rounded-2xl bg-surface p-6">
		<p class="font-semibold text-heading">{title}</p>
		<p class="mt-2 text-sm text-muted">{body}</p>
		<div class="mt-5 flex justify-end gap-2">
			<button
				type="button"
				onclick={oncancel}
				class="rounded-full border border-border px-5 py-2 text-sm font-semibold text-heading transition hover:bg-surface-2"
			>
				Cancel
			</button>
			<button
				type="button"
				onclick={onconfirm}
				class="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:brightness-95"
			>
				{confirmLabel}
			</button>
		</div>
	</div>
</div>
