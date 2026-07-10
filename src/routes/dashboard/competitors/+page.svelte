<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const fmt = new Intl.NumberFormat('en-KE');
	const dateFmt = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' });
</script>

<svelte:head><title>Competitors — leaders.ke</title></svelte:head>

<h2 class="text-lg font-semibold text-heading">The race for {data.seat}</h2>
<p class="mt-1 text-sm text-muted">
	Everyone else contesting your seat, ranked by followers. Your numbers first for comparison.
</p>

<!-- Your baseline -->
<div class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
	{#each [{ value: data.mine.followers, label: 'Your followers' }, { value: data.mine.postCount, label: 'Your public posts' }, { value: data.mine.pillarCount, label: 'Your pillars' }, { value: data.mine.mentionCount, label: 'Your news mentions' }] as stat (stat.label)}
		<div class="rounded-2xl border border-primary bg-surface p-4">
			<p class="text-2xl font-extrabold tabular-nums text-heading">{fmt.format(stat.value)}</p>
			<p class="mt-1 text-xs text-muted">{stat.label}</p>
		</div>
	{/each}
</div>

{#if data.rivals.length > 0}
	<div class="mt-6 overflow-x-auto rounded-2xl border border-border">
		<table class="w-full min-w-160 border-collapse text-left">
			<thead>
				<tr class="bg-surface-2">
					<th class="px-4 py-3 text-sm font-semibold text-heading">Rival</th>
					<th class="px-4 py-3 text-sm font-semibold text-heading">Followers</th>
					<th class="px-4 py-3 text-sm font-semibold text-heading">Posts</th>
					<th class="px-4 py-3 text-sm font-semibold text-heading">Pillars</th>
					<th class="px-4 py-3 text-sm font-semibold text-heading">Mentions</th>
					<th class="px-4 py-3 text-sm font-semibold text-heading">Latest post</th>
				</tr>
			</thead>
			<tbody>
				{#each data.rivals as rival (rival.path)}
					<tr class="border-t border-border">
						<td class="px-4 py-3">
							<a href={rival.path} class="text-sm font-medium text-heading hover:text-primary">
								{rival.name}
							</a>
							<p class="text-xs text-muted capitalize">
								{rival.status}{rival.party ? ` · ${rival.party}` : ''}{rival.verified ? ' · ✓ verified' : ''}
							</p>
						</td>
						<td class="px-4 py-3 text-sm font-semibold tabular-nums {rival.followers > data.mine.followers ? 'text-primary' : 'text-heading'}">
							{fmt.format(rival.followers)}
						</td>
						<td class="px-4 py-3 text-sm tabular-nums">{rival.postCount}</td>
						<td class="px-4 py-3 text-sm tabular-nums">{rival.pillarCount}</td>
						<td class="px-4 py-3 text-sm tabular-nums">{rival.mentionCount}</td>
						<td class="px-4 py-3 text-sm text-muted">
							{#if rival.latestPost}
								{rival.latestPost.title}
								<span class="text-xs">({dateFmt.format(new Date(rival.latestPost.createdAt))})</span>
							{:else}
								—
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<div class="mt-6 rounded-2xl border border-dashed border-border p-8 text-center">
		<p class="font-semibold text-heading">No declared rivals yet</p>
		<p class="mx-auto mt-2 max-w-md text-sm text-muted">
			When other candidates claim profiles for your seat, their public numbers appear here.
		</p>
	</div>
{/if}
