<script lang="ts">
	import ContactsTab from '$lib/components/application/ContactsTab.svelte';
	// The server module may be re-exported across families, so $types can't always
	// infer PageData — the shared component defines the actual contract.
	let { data, form }: { data: any; form: any } = $props();
</script>

<ContactsTab {data} {form} />
