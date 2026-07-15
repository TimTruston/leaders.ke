<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let deciding = $state(false);
</script>

<svelte:head><title>Review claim — leaders.ke</title></svelte:head>

<section class="mx-auto max-w-md px-4 py-16 text-center sm:px-6">
	{#if form?.decided === 'approved'}
		<h1 class="text-2xl font-bold text-heading">Claim approved</h1>
		<p class="mt-2 text-sm text-muted">
			{data.claimantName} now has manager access to your profile. You can ask a platform admin to
			revert this at any time.
		</p>
	{:else if form?.decided === 'rejected'}
		<h1 class="text-2xl font-bold text-heading">Claim rejected</h1>
		<p class="mt-2 text-sm text-muted">
			{data.claimantName} will not get access to your profile. No further action is needed.
		</p>
	{:else}
		<h1 class="text-2xl font-bold text-heading">Review this claim</h1>
		<p class="mt-2 text-sm leading-relaxed text-muted">
			<strong class="text-heading">{data.claimantName}</strong> wants to manage the profile of
			<strong class="text-heading">{data.subjectName}</strong> on leaders.ke. Approving makes them
			an admin manager of the profile.
		</p>

		{#if form?.error}
			<p class="mt-4 text-sm font-medium text-red-500">{form.error}</p>
		{/if}

		<form
			method="post"
			action="?/decide"
			class="mt-6 flex justify-center gap-3"
			use:enhance={() => {
				deciding = true;
				return async ({ update }) => {
					deciding = false;
					await update();
				};
			}}
		>
			<button
				type="submit"
				name="decision"
				value="approved"
				disabled={deciding}
				class="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition hover:brightness-95 disabled:opacity-60"
			>
				Approve
			</button>
			<button
				type="submit"
				name="decision"
				value="rejected"
				disabled={deciding}
				class="rounded-full border border-border px-6 py-2.5 text-sm font-semibold text-heading transition hover:bg-surface-2 disabled:opacity-60"
			>
				Reject
			</button>
		</form>
	{/if}
</section>
