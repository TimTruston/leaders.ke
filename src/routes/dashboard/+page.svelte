<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const dateFmt = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' });
</script>

<svelte:head><title>Overview — leaders.ke</title></svelte:head>

<div class="flex min-h-[70vh] flex-col">
<div class="grid gap-8 lg:grid-cols-2">
	<div>
		<h1 class="text-xl font-bold text-heading">My Choice</h1>
		<p class="mt-1 text-sm text-muted">Candidates you've pledged to vote for.</p>

		{#if data.pledges.length > 0}
			<ul class="mt-4 space-y-3">
				{#each data.pledges as pledge (pledge.path)}
					<li class="rounded-2xl border border-border bg-surface p-4">
						<a href={pledge.path} class="font-semibold text-heading hover:text-primary">
							{pledge.leaderName}
						</a>
						<p class="text-sm text-muted">{pledge.positionTitle}, {pledge.region}</p>
					</li>
				{/each}
			</ul>
		{:else}
			<div class="mt-4 rounded-2xl border border-dashed border-border p-8 text-center">
				<p class="font-semibold text-heading">Simulate your vote</p>
				<p class="mx-auto mt-2 max-w-md text-sm text-muted">You haven't simulated your 2027 ballot yet.</p>
				<a
					href="/vote/2027"
					class="mt-3 inline-block rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95"
				>
					Hit the ballot
				</a>
			</div>
		{/if}
	</div>

	<div>
		<h2 class="text-lg font-semibold text-heading">News</h2>
		<p class="mt-1 text-sm text-muted">Updates from the {data.followedLeaders.length} leaders you follow.</p>

		{#if data.feed.length > 0}
			<div class="mt-4 space-y-4">
				{#each data.feed as post (post.id)}
					<article class="rounded-2xl border border-border bg-surface p-5">
						<div class="flex flex-wrap items-baseline justify-between gap-2">
							<a href={post.leaderPath} class="text-sm font-semibold text-heading hover:text-primary">
								{post.leaderName}
							</a>
							<span class="text-xs text-muted">{dateFmt.format(new Date(post.createdAt))}</span>
						</div>
						<p class="mt-2 font-medium text-heading">{post.title}</p>
						<p class="mt-1 text-sm leading-relaxed text-muted">{post.body}</p>
					</article>
				{/each}
			</div>
		{:else}
			<div class="mt-4 rounded-2xl border border-dashed border-border p-8 text-center">
				<p class="font-semibold text-heading">No updates yet</p>
				<p class="mx-auto mt-2 max-w-md text-sm text-muted">
					{data.followedLeaders.length > 0
						? "The leaders you follow haven't posted anything yet."
						: 'Follow a leader from their public page to see their updates here.'}
				</p>
				<a
					href="/presidents"
					class="mt-4 inline-block rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95"
				>
					Browse leaders
				</a>
			</div>
		{/if}
	</div>
</div>

<!-- Claim your profile: pinned to the bottom of the page even when there's little content above. -->
<div class="mt-8 lg:mt-auto pt-8 rounded-3xl bg-primary p-6 text-center text-on-primary">
	<h2 class="text-lg font-bold text-on-primary">For Leaders and Campaign Managers</h2>
	<p class="mt-2 text-sm text-on-primary/80">
		Are you a Leader, Aspirant or Managing a Leader's PR or campaign?<br/>
		Launch your public page and manage your PR and campaigns here.
	</p>
	<a
		href="/onboard/profile"
		class="mt-4 inline-block rounded-full bg-surface px-5 py-2.5 text-sm font-semibold text-heading transition hover:bg-surface-2"
	>
		Create Your Profile
	</a>
</div>
</div>
