<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/auth/AuthCard.svelte';
	import Field from '$lib/components/auth/Field.svelte';
	import Submit from '$lib/components/auth/Submit.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<AuthCard title="Change email" subtitle={`Currently ${data.currentEmail}`}>
	{#if form?.success}
		<p class="rounded-lg bg-primary-soft px-4 py-3 text-sm text-on-primary">
			We've sent a confirmation link to your new address. The change takes effect once you confirm.
		</p>
	{:else}
		<form method="post" use:enhance class="space-y-4">
			<Field label="New email" name="newEmail" type="email" autocomplete="email" required />
			{#if form?.message}
				<p class="text-sm text-red-500">{form.message}</p>
			{/if}
			<Submit>Send confirmation</Submit>
		</form>
	{/if}

	{#snippet footer()}
		<a href="/" class="font-semibold text-primary hover:underline">Back to home</a>
	{/snippet}
</AuthCard>
