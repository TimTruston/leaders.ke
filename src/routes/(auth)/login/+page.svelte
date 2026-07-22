<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/auth/AuthCard.svelte';
	import Field from '$lib/components/auth/Field.svelte';
	import GoogleButton from '$lib/components/auth/GoogleButton.svelte';
	import Submit from '$lib/components/auth/Submit.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<AuthCard title="Welcome back" subtitle="Sign in to your leaders.ke account">
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
					: 'a follower'}. Sign in to accept the invite.
		</p>
	{/if}
	{#if data.googleEnabled}
		<GoogleButton label="Sign in with Google" next={data.next} />
		<div class="my-5 flex items-center gap-3 text-xs text-muted">
			<span class="h-px flex-1 bg-border"></span>
			or
			<span class="h-px flex-1 bg-border"></span>
		</div>
	{/if}

	<form method="post" action="?/email" use:enhance class="space-y-4">
		<!-- action="?/email" replaces the page's whole query string on submit (same
		class of bug as checkout's Pay action), so ?next (and ?email for invites)
		would otherwise vanish before the server ever sees them. -->
		<input type="hidden" name="next" value={data.next} />
		{#if data.lockedEmail}<input type="hidden" name="lockedEmail" value={data.lockedEmail} />{/if}
		<Field
			label="Email"
			name="email"
			type="email"
			autocomplete="email"
			required
			readonly={!!data.lockedEmail}
			value={data.devEmail}
		/>
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
		New here?
		<a
			href="/signup?next={encodeURIComponent(data.next)}"
			class="font-semibold text-primary hover:underline"
		>
			Create an account
		</a>
	{/snippet}
</AuthCard>
