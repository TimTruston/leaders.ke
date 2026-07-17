<script lang="ts">
	// Rotates one word of a headline in place. Only the active word is in the DOM,
	// so the span is exactly that word's width and whatever follows tracks tightly
	// against it — no reserved space for the longest word. The outgoing word leaves
	// immediately (in: only), so the width snaps rather than easing, keeping the
	// pair glued together. `delay` staggers two cyclers so one word swaps at a time.
	import { fly } from 'svelte/transition';

	let {
		words,
		interval = 3000,
		delay = 0
	}: { words: string[]; interval?: number; delay?: number } = $props();

	let index = $state(0);

	$effect(() => {
		let tick: ReturnType<typeof setInterval>;
		const start = setTimeout(() => {
			tick = setInterval(() => (index = (index + 1) % words.length), interval);
		}, delay);
		return () => {
			clearTimeout(start);
			clearInterval(tick);
		};
	});
</script>

{#key index}
	<span class="inline-block" in:fly={{ y: 8, duration: 400 }}>{words[index]}</span>
{/key}
