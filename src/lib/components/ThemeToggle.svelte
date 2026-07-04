<script lang="ts">
	// Reflects and flips the `.dark` class on <html>. Initial state is read from the DOM
	// so it stays in sync with the no-flash script in app.html.
	let dark = $state(false);

	$effect(() => {
		dark = document.documentElement.classList.contains('dark');
	});

	function toggle() {
		dark = !dark;
		document.documentElement.classList.toggle('dark', dark);
		try {
			localStorage.setItem('theme', dark ? 'dark' : 'light');
		} catch (e) {
			// ignore storage failures (private mode)
		}
	}
</script>

<button
	type="button"
	onclick={toggle}
	aria-label="Toggle dark mode"
	aria-pressed={dark}
	class="grid size-9 place-items-center rounded-full border border-border bg-surface-2 text-heading transition hover:bg-surface-3 focus:ring-2 focus:ring-ring focus:outline-none"
>
	{#if dark}
		<!-- sun -->
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-4">
			<circle cx="12" cy="12" r="4" />
			<path
				stroke-linecap="round"
				d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"
			/>
		</svg>
	{:else}
		<!-- moon -->
		<svg viewBox="0 0 24 24" fill="currentColor" class="size-4">
			<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
		</svg>
	{/if}
</button>
