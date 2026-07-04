<script lang="ts">
	import type { Snippet } from 'svelte';

	// Full-width primary button shared by auth forms.
	interface Props {
		children: Snippet;
		formaction?: string;
	}

	let { children, formaction }: Props = $props();
</script>

<button
	type="submit"
	{formaction}
	class="w-full rounded-lg bg-primary px-4 py-2.5 font-semibold text-on-primary transition hover:brightness-95 focus:ring-2 focus:ring-ring focus:outline-none"
>
	{@render children()}
</button>
