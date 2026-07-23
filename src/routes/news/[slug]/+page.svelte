<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import { renderRichText } from '$lib/utils/richtext';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const dateFmt = new Intl.DateTimeFormat('en-KE', { dateStyle: 'long' });
</script>

<svelte:head>
	<title>{data.title} — leaders.ke News</title>
</svelte:head>

<article class="mx-auto max-w-5xl px-4 py-14 sm:px-6">
	<div class="flex items-center justify-between">
		<a href="/news" class="text-sm font-semibold text-primary hover:underline">← All news</a>
		{#if data.editHref}
			<a href={data.editHref} class="text-sm font-semibold text-primary hover:underline">Edit</a>
		{/if}
	</div>

	<h1 class="mt-4 text-4xl font-bold tracking-tight text-heading">{data.title}</h1>

	<div class="mt-6 flex items-center gap-3 border-y border-border py-4">
		<a href={data.author.path} class="shrink-0">
			<Avatar name={data.author.name} initials={data.author.initials} photoUrl={data.author.photoUrl} sizeClass="size-11" textClass="text-base" />
		</a>
		<div>
			<a href={data.author.path} class="font-semibold text-heading hover:text-primary">{data.author.name}</a>
			<p class="text-sm text-muted">{dateFmt.format(new Date(data.createdAt))}</p>
		</div>
	</div>

	<!-- Same trust boundary as a leader's bio/campaign description: authored by the
	campaign's own team via the RichTextEditor, whose markers renderRichText escapes
	before formatting, so {@html} is safe here. -->
	<div class="prose-leaders mt-8 space-y-4 text-lg leading-relaxed text-heading">
		{@html renderRichText(data.body)}
	</div>

	{#if data.tags.length}
		<div class="mt-8 flex flex-wrap gap-1.5 border-t border-border pt-6">
			{#each data.tags as tag (tag)}
				<span class="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted">{tag}</span>
			{/each}
		</div>
	{/if}
</article>

<style>
	.prose-leaders :global(a) {
		text-decoration: underline;
	}
	.prose-leaders :global(ul),
	.prose-leaders :global(ol) {
		margin-left: 1rem;
	}
</style>
