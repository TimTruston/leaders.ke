<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import FollowersTable from '$lib/components/FollowersTable.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// The public profile URL is where followers sign up; surfaced here for sharing.
	const publicPath = $derived(page.data.leaderContext?.publicPath ?? '/presidents');
	const county = $derived(page.data.leaderContext?.region ?? null);

	function onWardChange(event: Event) {
		const ward = (event.target as HTMLSelectElement).value;
		goto(ward ? `?ward=${encodeURIComponent(ward)}` : '?', { keepFocus: true });
	}
</script>

<svelte:head><title>Followers — leaders.ke</title></svelte:head>

{#if form?.invited}
	<div class="mb-6 rounded-xl bg-primary-soft p-4 text-sm font-medium text-on-primary">
		Invite sent to {form.invited.email}
	</div>
{:else if form?.added}
	<div class="mb-6 rounded-xl bg-primary-soft p-4 text-sm font-medium text-on-primary">
		{form.added.name} now follows this campaign.
	</div>
{:else if form?.error}
	<div class="mb-6 rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
		{form.error}
	</div>
{/if}

<!-- Invite someone to follow directly, not just via the public page. -->
<form method="post" action="?/inviteFollower" class="flex flex-wrap gap-2" use:enhance>
	<input
		type="email"
		name="email"
		required
		placeholder="Invite someone to follow, by email"
		class="min-w-0 flex-1 rounded-full border border-border bg-surface px-4 py-2 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
	/>
	<button
		type="submit"
		class="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95"
	>
		Send invite
	</button>
</form>

{#if data.followerInvites.length > 0}
	<ul class="mt-3 space-y-2">
		{#each data.followerInvites as invite (invite.id)}
			<li class="rounded-xl bg-surface-2 px-4 py-2.5 text-sm text-muted">Invited: {invite.email}</li>
		{/each}
	</ul>
{/if}

<div class="mt-6 flex flex-wrap items-end justify-between gap-4">
	<div>
		<h2 class="text-lg font-semibold text-heading">
			Followers <span class="text-sm font-normal text-muted">({data.total})</span>
		</h2>
		<p class="mt-1 text-sm text-muted">{data.newThisWeek} joined this week.</p>
	</div>

	{#if data.wards.length > 0}
		<select
			value={data.ward ?? ''}
			onchange={onWardChange}
			aria-label="Filter by ward"
			class="rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
		>
			<option value="">All wards</option>
			{#each data.wards as w (w)}
				<option value={w}>{w}</option>
			{/each}
		</select>
	{/if}
</div>

{#if data.total === 0}
	<!-- The add-a-citizen form below stays available: manual recruitment is how a
	roster gets its first rows. -->
	<div class="mt-6 rounded-2xl border border-dashed border-border p-8 text-center">
		<p class="font-semibold text-heading">No followers yet</p>
		<p class="mx-auto mt-2 max-w-md text-sm text-muted">
			Citizens follow you from your public page with just a name and phone or email. Share your
			link everywhere: posters, WhatsApp groups, radio mentions. You can also add citizens
			yourself below.
		</p>
		<a
			href={publicPath}
			class="mt-4 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition hover:brightness-95"
		>
			Open your public page
		</a>
	</div>
{/if}

<div class="mt-6">
	<FollowersTable
		followers={data.followers}
		total={data.total}
		page={data.page}
		pageSize={data.pageSize}
		pagerHref={(p) => (data.ward ? `?ward=${encodeURIComponent(data.ward)}&page=${p}` : `?page=${p}`)}
		{county}
	/>
</div>
