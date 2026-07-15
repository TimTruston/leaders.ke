<script lang="ts">
	import ContactsTab from '$lib/components/application/ContactsTab.svelte';
	// The server module is re-exported from the campaign family, so $types can't
	// infer PageData here - the shared component defines the actual contract.
	let { data, form }: { data: any; form: any } = $props();
</script>

<ContactsTab {data} {form} />
