<script lang="ts">
	import { page } from '$app/state';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Client-side geo filter over the loaded roster (server pagination comes with scale).
	let wardFilter = $state('');
	const wards = $derived(
		[...new Set(data.followers.map((f) => f.ward).filter(Boolean))].sort() as string[]
	);
	const filtered = $derived(
		data.followers.filter((f) => !wardFilter || f.ward === wardFilter)
	);

	const dateFmt = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' });

	// The public profile URL is where followers sign up; surfaced here for sharing.
	const publicPath = $derived(page.data.leaderContext?.publicPath ?? '/leaders');
</script>

<svelte:head><title>Followers — leaders.ke</title></svelte:head>

<div class="flex flex-wrap items-end justify-between gap-4">
	<div>
		<h2 class="text-lg font-semibold text-heading">
			Followers <span class="text-sm font-normal text-muted">({data.followers.length})</span>
		</h2>
		<p class="mt-1 text-sm text-muted">{data.newThisWeek} joined this week.</p>
	</div>

	{#if wards.length > 0}
		<select
			bind:value={wardFilter}
			aria-label="Filter by ward"
			class="rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-heading focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
		>
			<option value="">All wards</option>
			{#each wards as w (w)}
				<option value={w}>{w}</option>
			{/each}
		</select>
	{/if}
</div>

{#if data.followers.length === 0}
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
				{#each filtered as follower (follower.id)}
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
{/if}
