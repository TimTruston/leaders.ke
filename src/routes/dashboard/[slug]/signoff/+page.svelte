<script lang="ts">
	import SignoffTab from '$lib/components/application/SignoffTab.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<SignoffTab {data} {form} />
