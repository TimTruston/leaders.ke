<script lang="ts">
	import TeamTab from '$lib/components/application/TeamTab.svelte';
	// The server module is re-exported from the campaign family, so $types can't
	// infer PageData here - the shared component defines the actual contract.
	let { data, form }: { data: any; form: any } = $props();
</script>

<TeamTab {data} {form} />
