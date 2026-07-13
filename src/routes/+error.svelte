<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	const status = $derived($page.status);
	const detail = $derived(
		$page.error?.message ?? (status === 404 ? "The page is missing or has moved." : 'Please try again.')
	);

	// Auto-return home after a short countdown.
	let seconds = $state(5);
	onMount(() => {
		const tick = setInterval(() => {
			seconds -= 1;
			if (seconds <= 0) {
				clearInterval(tick);
				goto('/');
			}
		}, 1000);
		return () => clearInterval(tick);
	});
</script>

<svelte:head><title>{status} · leaders.ke</title></svelte:head>

<section class="flex min-h-[60vh] flex-col items-center justify-center px-5 py-16 text-center sm:py-24">
	<p class="text-5xl font-bold tracking-tighter text-gold/30">{status}</p>
	<h1 class="mt-3 text-xl max-w-md font-semibold text-ink-primary">{detail}</h1>

	<p class="mt-5 text-sm text-ink-secondary">
		Redirecting home in {seconds}s…
	</p>
</section>
