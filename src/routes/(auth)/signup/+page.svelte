<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/auth/AuthCard.svelte';
	import Field from '$lib/components/auth/Field.svelte';
	import GoogleButton from '$lib/components/auth/GoogleButton.svelte';
	import Submit from '$lib/components/auth/Submit.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<AuthCard title="Create your account" subtitle="Join leaders.ke and start engaging citizens">
	{#if data.notice}
		<p class="mb-4 rounded-xl bg-primary-soft p-3 text-sm text-on-primary">{data.notice}</p>
	{/if}
	{#if data.inviteBanner}
		<p class="mb-4 rounded-xl bg-primary-soft p-3 text-sm text-on-primary">
			You've been invited by {data.inviteBanner.leaderName} to join as
			{data.inviteBanner.role === 'manager'
				? 'a manager'
				: data.inviteBanner.role === 'ambassador'
					? 'an ambassador'
					: 'a follower'}. Create an account to accept the invite.
		</p>
	{/if}
	{#if data.googleEnabled}
		<GoogleButton label="Sign up with Google" next={data.next} />
		<div class="my-5 flex items-center gap-3 text-xs text-muted">
			<span class="h-px flex-1 bg-border"></span>
			or
			<span class="h-px flex-1 bg-border"></span>
		</div>
	{/if}

	<form method="post" action="?/email" use:enhance class="space-y-4">
		<div class="grid grid-cols-2 gap-3">
			<Field label="First name" name="firstName" autocomplete="given-name" required placeholder="Jane" />
			<Field
				label="Other names"
				name="otherNames"
				autocomplete="family-name"
				required
				placeholder="Mumbi Mwangi"
			/>
		</div>
		<Field
			label="Email"
			name="email"
			type="email"
			autocomplete="email"
			required
			readonly={!!data.lockedEmail}
			value={data.lockedEmail ?? ''}
		/>
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
		Already have an account?
		<a href="/login?next={encodeURIComponent(data.next)}" class="font-semibold text-primary hover:underline">
			Sign in
		</a>
	{/snippet}
</AuthCard>
