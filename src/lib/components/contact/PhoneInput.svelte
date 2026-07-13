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
		class="mt-1 flex items-stretch overflow-hidden rounded-xl border transition-colors focus-within:border-gold {bg}
			{invalid ? 'border-red-500/60' : 'border-hairline'}"
	>
		<span class="grid select-none place-items-center border-r border-hairline px-3 text-sm text-ink-secondary">
			+254
		</span>
		<input
			type="tel"
			inputmode="numeric"
			bind:value
			autocomplete="tel"
			placeholder="712 345 678"
			class="w-full bg-transparent px-3 py-3 text-ink-primary outline-hidden focus:outline-none focus:ring-0 placeholder:text-ink-secondary/60"
		/>
	</div>
	{#if value.length > 0 && normalized}
		<span class="mt-1 block text-xs text-mpesa">✓ {normalized}</span>
	{:else if invalid}
		<span class="mt-1 block text-xs text-red-400">Enter a valid Kenyan number</span>
	{/if}
</label>
