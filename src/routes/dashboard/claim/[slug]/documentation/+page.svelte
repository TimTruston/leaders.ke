<script lang="ts">
	import DocumentationTab from '$lib/components/application/DocumentationTab.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<DocumentationTab {data} {form} />
