<script lang="ts">
	import TeamTab from '$lib/components/application/TeamTab.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<TeamTab {data} {form} />
