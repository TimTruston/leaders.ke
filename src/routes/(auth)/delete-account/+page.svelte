<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/auth/AuthCard.svelte';
	import Field from '$lib/components/auth/Field.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<AuthCard title="Delete account" subtitle={data.email}>
	<div class="rounded-lg border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm">
		<p class="font-semibold text-red-500">This can't be undone.</p>
		<p class="mt-1">
			Deleting your account removes your profile, contacts, and campaigns permanently. Enter your
			password to confirm.
		</p>
	</div>

	<form method="post" use:enhance class="mt-4 space-y-4">
		<Field
			label="Password"
			name="password"
			type="password"
			autocomplete="current-password"
			required
		/>
		{#if form?.message}
			<p class="text-sm text-red-500">{form.message}</p>
		{/if}
		<button
			type="submit"
			class="w-full rounded-lg bg-red-600 px-4 py-2.5 font-semibold text-white transition hover:bg-red-700 focus:ring-0 focus:ring-red-500 focus:outline-none"
		>
			Delete my account
		</button>
	</form>

	{#snippet footer()}
		<a href="/dashboard" class="font-semibold text-primary hover:underline">Keep my account</a>
	{/snippet}
</AuthCard>
