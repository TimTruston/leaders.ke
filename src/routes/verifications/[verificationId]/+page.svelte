<script lang="ts">
	import Previews from '$lib/components/admin/Previews.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const p = $derived(data.preview);
</script>

<svelte:head>
	<title>Verification #{p.request.id} — Admin</title>
</svelte:head>

<Previews
	backHref="/dashboard/admin/verifications"
	backLabel="Verifications"
	reviewNoun="applicant"
	data={p.data}
	request={p.request}
	iebcCertificateUrl={p.iebcCertificateUrl}
	team={p.team}
	requestHistory={p.requestHistory}
	historyLabel="Verification history"
	{form}
/>
