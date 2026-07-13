<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Claim profile — leaders.ke</title></svelte:head>

<section class="mx-auto max-w-md px-4 py-16 text-center sm:px-6">
	{#if form?.requested}
		<h1 class="text-2xl font-bold text-heading">Claim submitted</h1>
		<p class="mt-2 text-sm text-muted">
			An admin will review your claim. You'll gain manager access to this profile once approved.
		</p>
		<a
			href="/dashboard"
			class="mt-6 inline-block rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition hover:brightness-95"
		>
			Go to dashboard
		</a>
	{:else}
		<h1 class="text-2xl font-bold text-heading">Claim this profile</h1>
		<p class="mt-2 text-sm leading-relaxed text-muted">
			Are you <strong class="text-heading">{data.leaderName}</strong> ({data.positionTitle}, {data.region})?
			Submit your ID for review; once approved you'll get full manager access to this profile.
		</p>

		{#if form?.error}
			<p class="mt-4 text-sm font-medium text-heading">{form.error}</p>
		{/if}

		<form method="post" use:enhance class="mt-6 space-y-3 text-left">
			<input
				type="text"
				name="nationalId"
				placeholder="National ID number"
				required
				class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
			/>
			<textarea
				name="note"
				rows="3"
				placeholder="Anything that helps us verify this is you (optional)"
				class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
			></textarea>
			<button
				type="submit"
				class="w-full rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition hover:brightness-95"
			>
				Submit claim
			</button>
		</form>
	{/if}
</section>
