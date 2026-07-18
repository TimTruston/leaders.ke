<script lang="ts">
	// Country-wide seats only (/president, /deputy-president) — multi-region
	// singulars never render here, they 301 to their plural directory.
	import SeatHub from '$lib/components/SeatHub.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<SeatHub data={data.hub} />
