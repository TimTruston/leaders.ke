<script lang="ts">
	import SeatHub from '$lib/components/SeatHub.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<SeatHub {data} />
