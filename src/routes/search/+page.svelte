<script lang="ts">
	import LeaderCard from '$lib/components/LeaderCard.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const hasResults = $derived(
		data.leaders.length > 0 ||
			data.experience.length > 0 ||
			data.parties.length > 0 ||
			data.alliances.length > 0
	);
</script>

<svelte:head>
	<title>Search{data.q ? `: ${data.q}` : ''} — leaders.ke</title>
</svelte:head>

<section class="mx-auto max-w-7xl px-4 py-14 sm:px-6">
	<h1 class="text-3xl font-extrabold tracking-tight text-heading sm:text-4xl">
		{data.q ? `Results for "${data.q}"` : 'Search'}
	</h1>

	{#if data.q && !hasResults}
		<p class="mt-6 text-sm text-muted">Nothing matched. Try a different name, position, region, or institution.</p>
	{/if}

	{#if data.leaders.length > 0}
		<div class="mt-8">
			<h2 class="text-sm font-semibold tracking-wide text-muted uppercase">Leaders</h2>
			<div class="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each data.leaders as leader (leader.path)}
					<LeaderCard
						path={leader.path}
						name={leader.name}
						initials={leader.initials}
						verified={leader.verified}
						party={leader.party}
						partyPath={leader.partyPath}
						positionTitle={leader.positionTitle}
						region={leader.region}
						bio={leader.bio}
					/>
				{/each}
			</div>
		</div>
	{/if}

	{#if data.experience.length > 0}
		<div class="mt-10">
			<h2 class="text-sm font-semibold tracking-wide text-muted uppercase">Experience</h2>
			<ul class="mt-3 space-y-2">
				{#each data.experience as item, i (i)}
					<li class="rounded-xl bg-surface-2 px-4 py-3 text-sm">
						<a href={item.path} class="font-medium text-heading hover:text-primary">{item.leaderName}</a>
						<span class="text-muted"> — {item.title}, {item.institution}</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if data.parties.length > 0}
		<div class="mt-10">
			<h2 class="text-sm font-semibold tracking-wide text-muted uppercase">Parties</h2>
			<div class="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each data.parties as party (party.path)}
					<a
						href={party.path}
						class="rounded-2xl border border-border bg-surface p-5 transition hover:border-primary hover:shadow-sm"
					>
						<p class="font-semibold text-heading">{party.name}</p>
						{#if party.abbreviation}<p class="text-xs text-muted">{party.abbreviation}</p>{/if}
					</a>
				{/each}
			</div>
		</div>
	{/if}

	{#if data.alliances.length > 0}
		<div class="mt-10">
			<h2 class="text-sm font-semibold tracking-wide text-muted uppercase">Alliances</h2>
			<div class="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each data.alliances as alliance (alliance.path)}
					<a
						href={alliance.path}
						class="rounded-2xl border border-border bg-surface p-5 transition hover:border-primary hover:shadow-sm"
					>
						<p class="font-semibold text-heading">{alliance.title}</p>
						{#if alliance.description}<p class="mt-1 line-clamp-2 text-sm text-muted">{alliance.description}</p>{/if}
					</a>
				{/each}
			</div>
		</div>
	{/if}
</section>
