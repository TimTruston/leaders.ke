<script lang="ts">
	import { enhance } from '$app/forms';
	import Previews from '$lib/components/admin/Previews.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const p = $derived(data.preview);
	let emailing = $state(false);
</script>

<svelte:head>
	<title>Claim #{p.request.id} — Admin</title>
</svelte:head>

{#snippet actionsExtra()}
	{#if !p.request.outcome}
		<button
			type="button"
			onclick={() => (emailing = !emailing)}
			class="rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-heading transition hover:bg-surface-2"
		>
			{emailing ? 'Cancel' : 'Email the leader'}
		</button>
	{/if}
{/snippet}

{#snippet belowActions()}
	{#if form?.emailed}
		<p class="mt-3 text-sm font-medium text-on-primary">Approve link sent to {form.sentTo}.</p>
	{/if}
	{#if emailing}
		<form
			method="post"
			action="?/emailLeader"
			class="mt-3 flex flex-wrap items-center gap-2"
			use:enhance={() => {
				return async ({ update }) => {
					emailing = false;
					await update();
				};
			}}
		>
			<input
				type="email"
				name="email"
				required
				placeholder="Leader's email address"
				class="min-w-64 flex-1 rounded-full border border-border bg-surface px-4 py-1.5 text-xs text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
			/>
			<button
				type="submit"
				class="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary transition hover:brightness-95"
			>
				Send approval email
			</button>
		</form>
	{/if}
{/snippet}

<Previews
	backHref="/dashboard/admin/claims"
	backLabel="Profile claims"
	reviewNoun="claimant"
	data={p.data}
	request={p.request}
	iebcCertificateUrl={p.iebcCertificateUrl}
	team={p.team}
	requestHistory={p.requestHistory}
	historyLabel="Claim history"
	{form}
	{actionsExtra}
	{belowActions}
/>
