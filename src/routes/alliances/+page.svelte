<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Alliances — leaders.ke</title>
	<meta name="description" content="Informal political alliances and coalitions ahead of the 2027 General Elections." />
</svelte:head>

<section class="mx-auto max-w-7xl px-4 py-14 sm:px-6">
	<div class="max-w-2xl">
		<h1 class="text-3xl font-extrabold tracking-tight text-heading sm:text-4xl">Alliances</h1>
		<p class="mt-3 text-base leading-relaxed">
			Informal coalitions of parties and leaders, outside formal party registration.
		</p>
	</div>

	<div class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each data.alliances as alliance (alliance.slug)}
			<a
				href="/alliances/{alliance.slug}"
				class="rounded-2xl border border-border bg-surface p-5 transition hover:border-primary hover:shadow-sm"
			>
				<p class="font-semibold text-heading">{alliance.title}</p>
				{#if alliance.description}<p class="mt-1 line-clamp-2 text-sm text-muted">{alliance.description}</p>{/if}
				<p class="mt-3 text-sm text-muted">{alliance.memberCount} current member{alliance.memberCount === 1 ? '' : 's'}</p>
			</a>
		{:else}
			<div class="rounded-2xl border border-border bg-surface p-8 text-center sm:col-span-2 lg:col-span-3">
				<p class="font-semibold text-heading">No alliances listed yet</p>
			</div>
		{/each}
	</div>
</section>
