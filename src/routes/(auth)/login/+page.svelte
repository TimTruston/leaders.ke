<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/auth/AuthCard.svelte';
	import Field from '$lib/components/auth/Field.svelte';
	import Submit from '$lib/components/auth/Submit.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<AuthCard title="Welcome back" subtitle="Sign in to your leaders.ke account">
	<form method="post" use:enhance class="space-y-4">
		<Field label="Email" name="email" type="email" autocomplete="email" required value={data.devEmail} />
		<Field
			label="Password"
			name="password"
			type="password"
			autocomplete="current-password"
			required
			value={data.devPassword}
		/>
		<div class="text-right">
			<a href="/forgot-password" class="text-sm font-medium text-primary hover:underline">
				Forgot password?
			</a>
		</div>
		{#if form?.message}
			<p class="text-sm text-red-500">{form.message}</p>
		{/if}
		<Submit>Sign in</Submit>
	</form>

	{#snippet footer()}
		New here? <a href="/signup" class="font-semibold text-primary hover:underline">Create an account</a>
	{/snippet}
</AuthCard>
