<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Campaign invite — leaders.ke</title></svelte:head>

<section class="mx-auto max-w-md px-4 py-16 text-center sm:px-6">
	{#if form?.accepted}
		<h1 class="text-2xl font-bold text-heading">You're in!</h1>
		<p class="mt-2 text-sm text-muted">
			You're now {form.role === 'manager' ? 'a manager' : 'an ambassador'} on this campaign.
		</p>
		<a
			href="/dashboard"
			class="mt-6 inline-block rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition hover:brightness-95"
		>
			Go to dashboard
		</a>
	{:else if !data.invite}
		<h1 class="text-2xl font-bold text-heading">Invite not valid</h1>
		<p class="mt-2 text-sm text-muted">
			This invite link has already been used, revoked, or expired.
		</p>
	{:else}
		<h1 class="text-2xl font-bold text-heading">Campaign invite</h1>
		<p class="mt-2 text-sm leading-relaxed text-muted">
			You've been invited to join <strong class="text-heading">{data.invite.leaderName}</strong>'s
			campaign ({data.invite.positionTitle}, {data.invite.region}) as
			{data.invite.role === 'manager' ? 'a manager' : 'an ambassador'}.
		</p>

		{#if form?.error}
			<p class="mt-4 text-sm font-medium text-heading">{form.error}</p>
		{/if}

		<form method="post" action="?/accept" use:enhance>
			<button
				type="submit"
				class="mt-6 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition hover:brightness-95"
			>
				Accept invite
			</button>
		</form>
	{/if}
</section>
