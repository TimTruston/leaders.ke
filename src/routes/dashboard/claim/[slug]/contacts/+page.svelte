<script lang="ts">
	import ContactsTab from '$lib/components/application/ContactsTab.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<ContactsTab {data} {form} />
