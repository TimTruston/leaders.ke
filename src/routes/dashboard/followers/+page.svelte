<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Pagination from '$lib/components/admin/Pagination.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const dateFmt = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' });
	const totalPages = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)));

	// The public profile URL is where followers sign up; surfaced here for sharing.
	const publicPath = $derived(page.data.leaderContext?.publicPath ?? '/leaders');

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
		class="min-w-0 flex-1 rounded-full border border-border bg-surface px-4 py-2 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
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
			class="rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-heading focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
		>
			<option value="">All wards</option>
			{#each data.wards as w (w)}
				<option value={w}>{w}</option>
			{/each}
		</select>
	{/if}
</div>

{#if data.total === 0}
	<div class="mt-6 rounded-2xl border border-dashed border-border p-8 text-center">
		<p class="font-semibold text-heading">No followers yet</p>
		<p class="mx-auto mt-2 max-w-md text-sm text-muted">
			Citizens follow you from your public page with just a name and phone or email. Share your
			link everywhere: posters, WhatsApp groups, radio mentions.
		</p>
		<a
			href={publicPath}
			class="mt-4 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition hover:brightness-95"
		>
			Open your public page
		</a>
	</div>
{:else if data.followers.length === 0}
	<p class="mt-6 text-sm text-muted">No followers match "{data.ward}".</p>
{:else}
	<div class="mt-6 overflow-x-auto rounded-2xl border border-border">
		<table class="w-full min-w-140 border-collapse text-left">
			<thead>
				<tr class="bg-surface-2">
					<th class="px-4 py-3 text-sm font-semibold text-heading">Name</th>
					<th class="px-4 py-3 text-sm font-semibold text-heading">Contact</th>
					<th class="px-4 py-3 text-sm font-semibold text-heading">Ward</th>
					<th class="px-4 py-3 text-sm font-semibold text-heading">Channels</th>
					<th class="px-4 py-3 text-sm font-semibold text-heading">Joined</th>
				</tr>
			</thead>
			<tbody>
				{#each data.followers as follower (follower.id)}
					<tr class="border-t border-border">
						<td class="px-4 py-3 text-sm font-medium text-heading">{follower.name}</td>
						<td class="px-4 py-3 text-sm">
							{follower.emailAddress ?? follower.phoneNumber ?? '—'}
						</td>
						<td class="px-4 py-3 text-sm">{follower.ward ?? '—'}</td>
						<td class="px-4 py-3 text-sm">
							{#each follower.channels as channel (channel)}
								<span
									class="mr-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-on-primary uppercase"
								>
									{channel}
								</span>
							{:else}
								<span class="text-muted">—</span>
							{/each}
						</td>
						<td class="px-4 py-3 text-sm text-muted">{dateFmt.format(new Date(follower.joinedAt))}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<Pagination
		page={data.page}
		{totalPages}
		total={data.total}
		itemLabel="followers"
		href={(p) => (data.ward ? `?ward=${encodeURIComponent(data.ward)}&page=${p}` : `?page=${p}`)}
	/>
{/if}
