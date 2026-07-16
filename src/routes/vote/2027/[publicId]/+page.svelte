<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import type { BallotLevel } from '$lib/server/ballot';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const LEVEL_LABEL: Record<BallotLevel, string> = {
		president: 'President',
		governor: 'Governor',
		senator: 'Senator',
		womanRep: 'Woman Representative',
		mp: 'Member of Parliament',
		mca: 'Member of County Assembly'
	};
</script>

<svelte:head>
	<title>My 2027 simulated ballot — leaders.ke</title>
	<meta
		name="description"
		content="See who I'd vote for in the 2027 General Election, then simulate your own ballot on leaders.ke."
	/>
</svelte:head>

<div class="mx-auto  px-4 py-12 sm:px-6">
	<div class="text-center">
		<span
			class="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-on-primary"
		>
			Simulated ballot
		</span>
		<h1 class="mt-3 text-2xl font-bold text-heading sm:text-3xl">My 2027 Ballot</h1>
		<p class="mt-1 text-sm text-muted">
			{data.wardName}, {data.constituencyName}, {data.countyName}
		</p>
	</div>

	<!-- Ballot card: no voter name/contact/location-below-ward is ever rendered here -->
	<div class="mt-8 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
		{#each data.results as { level, candidate } (level)}
			<div class="flex items-center gap-4 p-4 sm:p-5">
				{#if candidate}
					<Avatar name={candidate.name} initials={candidate.initials} photoUrl={candidate.photoUrl} sizeClass="size-14" textClass="text-sm" />
				{:else}
					<span class="grid size-14 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-bold text-muted">—</span>
				{/if}
				<div class="min-w-0 flex-1">
					<p class="text-xs font-semibold tracking-wide text-muted uppercase">
						{LEVEL_LABEL[level]}
					</p>
					{#if candidate}
						<p class="truncate font-semibold text-heading">{candidate.name}</p>
						{#if candidate.party}<p class="text-xs text-muted">{candidate.party}</p>{/if}
					{:else}
						<p class="text-sm text-muted">No selection</p>
					{/if}
				</div>
			</div>
		{/each}
	</div>

	<div class="mt-10 flex flex-col items-center gap-3 text-center">
		<a
			href="/vote/2027"
			class="rounded-full bg-primary px-6 py-3 font-semibold text-on-primary transition hover:brightness-95"
		>
			Simulate Your Vote
		</a>
		<p class="max-w-md text-xs text-muted">
			This is a simulated voting experience for the 2027 General Election. It is not an official
			ballot, does not register any vote, and results are never tallied or published per candidate.
			Data is handled under the Kenya Data Protection Act (2019). For official voter information,
			visit the <a href="https://www.iebc.or.ke" class="underline hover:text-heading">IEBC</a>.
		</p>
	</div>
</div>
