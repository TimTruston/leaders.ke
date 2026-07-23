<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import Pagination from '$lib/components/admin/Pagination.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const dateFmt = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' });
	const totalPages = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)));
</script>

<svelte:head>
	<title>News — leaders.ke</title>
	<meta name="description" content="Updates, announcements, and campaign news from leaders and candidates on leaders.ke." />
</svelte:head>

<div class="border-b border-border bg-surface-2">
	<div class="mx-auto max-w-5xl px-4 py-14 sm:px-6">
		<h1 class="text-4xl font-bold tracking-tight text-heading">News</h1>
		<p class="mt-3 text-lg leading-relaxed text-muted">
			Updates, announcements, and campaign news, straight from leaders and candidates themselves.
		</p>
	</div>
</div>

<div class="mx-auto max-w-5xl px-4 py-12 sm:px-6">
	<div class="divide-y divide-border">
		{#each data.articles as article (article.slug)}
			<article class="py-8 first:pt-0">
				<div class="flex items-center gap-2.5">
					<a href={article.authorPath} class="shrink-0">
						<Avatar name={article.authorName} initials={article.authorInitials} photoUrl={article.authorPhotoUrl} sizeClass="size-9" textClass="text-sm" />
					</a>
					<div class="text-sm">
						<a href={article.authorPath} class="font-semibold text-heading hover:text-primary">{article.authorName}</a>
						<span class="text-muted"> · {dateFmt.format(new Date(article.createdAt))}</span>
					</div>
				</div>

				<h2 class="mt-4 text-2xl font-bold text-heading">
					<a href="/news/{article.slug}" class="hover:text-primary">{article.title}</a>
				</h2>
				<p class="mt-3 leading-relaxed text-muted">{article.excerpt}</p>

				<div class="mt-4 flex flex-wrap items-center gap-3">
					{#if article.tags.length}
						<div class="flex flex-wrap gap-1.5">
							{#each article.tags as tag (tag)}
								<span class="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted">{tag}</span>
							{/each}
						</div>
					{/if}
					<a href="/news/{article.slug}" class="ml-auto text-sm font-semibold text-primary hover:underline">Read more →</a>
				</div>
			</article>
		{:else}
			<p class="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted">
				No news yet. Check back once campaigns start posting.
			</p>
		{/each}
	</div>

	<Pagination
		page={data.page}
		{totalPages}
		total={data.total}
		itemLabel="articles"
		href={(p) => `/news?page=${p}`}
	/>
</div>
