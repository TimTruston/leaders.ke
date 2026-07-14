<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	// Labeled input used across every auth form so styling stays consistent.
	interface Props {
		label: string;
		name: string;
		type?: 'text' | 'email' | 'password';
		value?: string;
		required?: boolean;
		readonly?: boolean;
		autocomplete?: HTMLInputAttributes['autocomplete'];
		placeholder?: string;
	}

	let {
		label,
		name,
		type = 'text',
		value = $bindable(''),
		required = false,
		readonly = false,
		autocomplete,
		placeholder
	}: Props = $props();
</script>

<label class="block">
	<span class="mb-1 block text-sm font-medium text-heading">{label}</span>
	<input
		{name}
		{type}
		{required}
		{readonly}
		{autocomplete}
		{placeholder}
		bind:value
		class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none {readonly
			? 'cursor-not-allowed opacity-70'
			: ''}"
	/>
</label>
