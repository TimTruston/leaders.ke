<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/auth/AuthCard.svelte';
	import Submit from '$lib/components/auth/Submit.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<AuthCard title="Verify your email" subtitle={data.email}>
	{#if data.verified}
		<button
			type="button"
			disabled
			class="w-full cursor-default rounded-lg bg-primary-soft px-4 py-2.5 font-semibold text-on-primary"
		>
			✓ Email verified
		</button>
	{:else if form?.sent}
		<p class="rounded-lg bg-primary-soft px-4 py-3 text-sm text-on-primary">
			A verification link is on its way. Check your inbox (or the dev console).
		</p>
	{:else}
		<p class="text-sm">
			Your email isn't verified yet. Send yourself a fresh verification link.
		</p>
		<form method="post" use:enhance class="mt-4">
			{#if form?.message}
				<p class="mb-3 text-sm text-red-500">{form.message}</p>
			{/if}
			<Submit>Send verification email</Submit>
		</form>
	{/if}

	{#snippet footer()}
		<a href="/dashboard" class="font-semibold text-primary hover:underline">Back to dashboard</a>
	{/snippet}
</AuthCard>
