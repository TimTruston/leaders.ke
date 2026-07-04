<script lang="ts">
	// Live countdown to the 2027 Kenya General Election: 10 August 2027.
	const target = new Date('2027-08-10T00:00:00+03:00').getTime();

	let now = $state(Date.now());

	$effect(() => {
		const id = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(id);
	});

	const remaining = $derived(Math.max(0, target - now));
	const units = $derived([
		{ label: 'Days', value: Math.floor(remaining / 86_400_000) },
		{ label: 'Hours', value: Math.floor((remaining / 3_600_000) % 24) },
		{ label: 'Minutes', value: Math.floor((remaining / 60_000) % 60) },
		{ label: 'Seconds', value: Math.floor((remaining / 1000) % 60) }
	]);
</script>

<div class="flex items-end gap-2 sm:gap-3" aria-label="Countdown to 10 August 2027">
	{#each units as unit (unit.label)}
		<div class="flex flex-col items-center">
			<span
				class="grid min-w-14 place-items-center rounded-xl bg-surface-2 px-2 py-3 text-2xl font-bold tabular-nums text-heading sm:min-w-16 sm:text-3xl"
			>
				{String(unit.value).padStart(2, '0')}
			</span>
			<span class="mt-1 text-xs font-medium tracking-wide text-muted uppercase">{unit.label}</span>
		</div>
	{/each}
</div>
