<script lang="ts">
	import { normalizeKenyanPhone } from '$lib/utils/phone';

	let {
		value = $bindable(''),
		label = 'Phone number',
		bg = 'bg-surface'
	}: {
		value?: string;
		label?: string;
		/** Tailwind bg class for the wrapper (matches the surrounding surface). */
		bg?: string;
	} = $props();

	const normalized = $derived(normalizeKenyanPhone(value));
	const invalid = $derived(value.length > 0 && normalized === null);
</script>

<label class="block">
	<span class="text-xs font-medium text-ink-secondary">{label}</span>
	<div
		class="mt-1 flex items-stretch overflow-hidden rounded-xl transition-colors {bg}
		border {invalid ? 'border-red-500/60' : 'border-border'}
		focus-within:border-primary focus:ring-2 focus:ring-ring outline-hidden focus:outline-none"
	>
		<span class="grid select-none place-items-center border-r border-border px-3 text-sm text-ink-secondary">
			+254
		</span>
		<input
			type="tel"
			inputmode="numeric"
			bind:value
			autocomplete="tel"
			placeholder="712 345 678"
			class="w-full bg-transparent px-3 py-3 text-ink-primary placeholder:text-ink-secondary/60 outline-hidden focus:outline-none focus:ring-0 border-0"
		/>
	</div>
	{#if value.length > 0 && normalized}
		<span class="mt-1 block text-xs text-mpesa">✓ {normalized}</span>
	{:else if invalid}
		<span class="mt-1 block text-xs text-red-400">Enter a valid Kenyan number</span>
	{/if}
</label>
