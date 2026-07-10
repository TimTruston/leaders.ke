<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Parties — leaders.ke</title>
	<meta name="description" content="Registered political parties ahead of the 2027 General Elections." />
</svelte:head>

<section class="mx-auto max-w-7xl px-4 py-14 sm:px-6">
	<div class="max-w-2xl">
		<h1 class="text-3xl font-extrabold tracking-tight text-heading sm:text-4xl">Parties</h1>
		<p class="mt-3 text-base leading-relaxed">Registered political parties, per the ORPP register.</p>
	</div>

	<div class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each data.parties as party (party.slug)}
			<a
				href="/parties/{party.slug}"
				class="rounded-2xl border border-border bg-surface p-5 transition hover:border-primary hover:shadow-sm"
			>
				<p class="font-semibold text-heading">{party.name}</p>
				{#if party.abbreviation}<p class="text-xs text-muted">{party.abbreviation}</p>{/if}
				<p class="mt-3 text-sm text-muted">{party.memberCount} current member{party.memberCount === 1 ? '' : 's'}</p>
			</a>
		{:else}
			<div class="rounded-2xl border border-border bg-surface p-8 text-center sm:col-span-2 lg:col-span-3">
				<p class="font-semibold text-heading">No parties registered yet</p>
			</div>
		{/each}
	</div>
</section>
