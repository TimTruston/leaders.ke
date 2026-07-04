<script lang="ts">
	const slogans = [
		'The digital Town Hall of Kenya',
		'Convert fence-sitters into voters',
		'Secure donations for your campaign',
		'Mobilize your ambassadors for mass action',
		'Bringing back Democracy in Kenya',
		'Convince Gen Z and Millennials to Vote'
	];

	let index = $state(0);

	$effect(() => {
		const id = setInterval(() => (index = (index + 1) % slogans.length), 3500);
		return () => clearInterval(id);
	});
</script>

<div class="relative h-7 overflow-hidden text-primary">
	{#key index}
		<p class="animate-[slideUp_0.5s_ease] text-lg font-semibold">{slogans[index]}</p>
	{/key}
</div>

<style>
	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateY(0.75rem);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
