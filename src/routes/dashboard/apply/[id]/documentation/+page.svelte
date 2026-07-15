<script lang="ts">
	import DocumentationTab from '$lib/components/application/DocumentationTab.svelte';
	// The server module is re-exported from the campaign family, so $types can't
	// infer PageData here - the shared component defines the actual contract.
	let { data, form }: { data: any; form: any } = $props();
</script>

<DocumentationTab {data} {form} />
