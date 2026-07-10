<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.alliance.title} — leaders.ke</title>
	{#if data.alliance.description}<meta name="description" content={data.alliance.description} />{/if}
</svelte:head>

<section class="mx-auto max-w-7xl px-4 py-14 sm:px-6">
	<nav class="text-sm text-muted" aria-label="Breadcrumb">
		<a href="/alliances" class="hover:text-heading hover:underline">Alliances</a>
		<span class="mx-1">/</span>
		<span>{data.alliance.title}</span>
	</nav>

	<div class="mt-4 max-w-2xl">
		<h1 class="text-3xl font-extrabold tracking-tight text-heading sm:text-4xl">{data.alliance.title}</h1>
		{#if data.alliance.description}<p class="mt-3 text-base leading-relaxed">{data.alliance.description}</p>{/if}
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
