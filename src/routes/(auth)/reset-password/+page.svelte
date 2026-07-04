<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/auth/AuthCard.svelte';
	import Field from '$lib/components/auth/Field.svelte';
	import Submit from '$lib/components/auth/Submit.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<AuthCard title="Set a new password" subtitle="Choose a strong password you don't use elsewhere">
	<form method="post" use:enhance class="space-y-4">
		<input type="hidden" name="token" value={data.token} />
		<Field
			label="New password"
			name="password"
			type="password"
			autocomplete="new-password"
			required
		/>
		{#if form?.message}
			<p class="text-sm text-red-500">{form.message}</p>
		{/if}
		<Submit>Update password</Submit>
	</form>

	{#snippet footer()}
		<a href="/login" class="font-semibold text-primary hover:underline">Back to sign in</a>
	{/snippet}
</AuthCard>
