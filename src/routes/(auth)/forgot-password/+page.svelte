<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/auth/AuthCard.svelte';
	import Field from '$lib/components/auth/Field.svelte';
	import Submit from '$lib/components/auth/Submit.svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<AuthCard title="Reset your password" subtitle="We'll email you a link to set a new password">
	{#if form?.sent}
		<p class="rounded-lg bg-primary-soft px-4 py-3 text-sm text-on-primary">
			If an account exists for that email, a reset link is on its way. Check your inbox.
		</p>
	{:else}
		<form method="post" use:enhance class="space-y-4">
			<Field label="Email" name="email" type="email" autocomplete="email" required />
			<Submit>Send reset link</Submit>
		</form>
	{/if}

	{#snippet footer()}
		Remembered it? <a href="/login" class="font-semibold text-primary hover:underline">Sign in</a>
	{/snippet}
</AuthCard>
