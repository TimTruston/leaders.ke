<script lang="ts">
	import type { Snippet } from 'svelte';

	// Full-width primary button shared by auth forms.
	interface Props {
		children: Snippet;
		formaction?: string;
		disabled?: boolean;
	}

	let { children, formaction, disabled = false }: Props = $props();
</script>

<button
	type="submit"
	{formaction}
	{disabled}
	class="w-full rounded-lg bg-primary px-4 py-2.5 font-semibold text-on-primary transition hover:brightness-95 focus:ring-0 focus:ring-ring focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
>
	{@render children()}
</button>
