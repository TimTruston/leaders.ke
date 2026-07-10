<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.party.name} — leaders.ke</title>
	{#if data.party.description}<meta name="description" content={data.party.description} />{/if}
</svelte:head>

<section class="mx-auto max-w-7xl px-4 py-14 sm:px-6">
	<nav class="text-sm text-muted" aria-label="Breadcrumb">
		<a href="/parties" class="hover:text-heading hover:underline">Parties</a>
		<span class="mx-1">/</span>
		<span>{data.party.name}</span>
	</nav>

	<div class="mt-4 max-w-2xl">
		<h1 class="text-3xl font-extrabold tracking-tight text-heading sm:text-4xl">
			{data.party.name}
			{#if data.party.abbreviation}<span class="text-muted">({data.party.abbreviation})</span>{/if}
		</h1>
		{#if data.party.slogan}<p class="mt-2 text-lg italic text-muted">{data.party.slogan}</p>{/if}
		{#if data.party.description}<p class="mt-3 text-base leading-relaxed">{data.party.description}</p>{/if}
		<p class="mt-3 text-xs font-semibold tracking-wide text-muted uppercase">{data.party.status} registration</p>
	</div>

	<div class="mt-8">
		<h2 class="text-sm font-semibold tracking-wide text-muted uppercase">
			Current members ({data.members.length})
		</h2>
		<div class="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each data.members as member (member.path)}
				<a
					href={member.path}
					class="rounded-2xl border border-border bg-surface p-5 transition hover:border-primary hover:shadow-sm"
				>
					<p class="font-semibold text-heading">{member.name}</p>
					<p class="mt-1 text-sm text-muted">{member.positionTitle}, {member.region}</p>
					<p class="mt-2 text-xs text-muted capitalize">{member.role}</p>
				</a>
			{:else}
				<div class="rounded-2xl border border-border bg-surface p-8 text-center sm:col-span-2 lg:col-span-3">
					<p class="font-semibold text-heading">No current members listed</p>
				</div>
			{/each}
		</div>
	</div>
</section>
