<script lang="ts">
	import CampaignTab from '$lib/components/application/CampaignTab.svelte';
	let { data, form }: { data: any; form: any } = $props();
</script>

<CampaignTab {data} {form} />
