<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/auth/AuthCard.svelte';
	import Field from '$lib/components/auth/Field.svelte';
	import Submit from '$lib/components/auth/Submit.svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<AuthCard title="Create your account" subtitle="Join leaders.ke and start engaging citizens">
	<form method="post" use:enhance class="space-y-4">
		<div class="grid grid-cols-2 gap-3">
			<Field label="First name" name="firstName" autocomplete="given-name" required placeholder="Jane" />
			<Field label="Last name" name="lastName" autocomplete="family-name" required placeholder="Wanjiku" />
		</div>
		<Field label="Email" name="email" type="email" autocomplete="email" required />
		<Field
			label="Password"
			name="password"
			type="password"
			autocomplete="new-password"
			required
		/>
		{#if form?.message}
			<p class="text-sm text-red-500">{form.message}</p>
		{/if}
		<Submit>Create account</Submit>
	</form>

	{#snippet footer()}
		Already have an account? <a href="/login" class="font-semibold text-primary hover:underline"
			>Sign in</a
		>
	{/snippet}
</AuthCard>
