<script lang="ts">
	import ProfileTab from '$lib/components/application/ProfileTab.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<ProfileTab {data} {form} />
