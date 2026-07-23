<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import Pagination from '$lib/components/admin/Pagination.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const dateFmt = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' });
	const totalPages = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)));

	// Toggling a tag/mention filter link: selecting the already-active one clears it.
	const tagHref = (tag: string) => (data.activeTag === tag ? '/news' : `/news?tag=${encodeURIComponent(tag)}`);
	const mentionHref = (slug: string) => (data.activeMention === slug ? '/news' : `/news?mention=${encodeURIComponent(slug)}`);
</script>

<svelte:head>
	<title>News — leaders.ke</title>
	<meta name="description" content="Updates, announcements, and campaign news from leaders and candidates on leaders.ke." />
</svelte:head>

<div class="border-b border-border bg-surface-2">
	<div class="mx-auto max-w-7xl px-4 py-14 sm:px-6">
		<h1 class="text-4xl font-bold tracking-tight text-heading">News</h1>
		<p class="mt-3 text-lg leading-relaxed text-muted">
			Updates, announcements, and campaign news, straight from leaders and candidates themselves.
		</p>
	</div>
</div>

<div class="mx-auto max-w-7xl px-4 py-12 sm:px-6">
	<div class="grid gap-10 lg:grid-cols-4">
		<div class="lg:col-span-3">
			{#if data.activeTag || data.activeMention}
				<div class="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted">
					<span>Filtering by</span>
					{#if data.activeTag}
						<span class="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-on-primary">{data.activeTag}</span>
					{/if}
					{#if data.activeMention}
						<span class="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-on-primary">
							@{data.mentions.find((m) => m.slug === data.activeMention)?.name ?? data.activeMention}
						</span>
					{/if}
					<a href="/news" class="font-semibold text-primary hover:underline">Clear</a>
				</div>
			{/if}

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

						{#if article.mentions.length}
							<p class="mt-3 text-sm text-muted">
								Mentions
								{#each article.mentions as m, i (m.slug)}{i > 0 ? ', ' : ' '}<a href={mentionHref(m.slug)} class="font-medium text-primary hover:underline">@{m.name}</a>{/each}
							</p>
						{/if}

						<div class="mt-4 flex flex-wrap items-center gap-3">
							{#if article.tags.length}
								<div class="flex flex-wrap gap-1.5">
									{#each article.tags as tag (tag)}
										<a href={tagHref(tag)} class="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted hover:border-primary hover:text-primary">{tag}</a>
									{/each}
								</div>
							{/if}
							<a href="/news/{article.slug}" class="ml-auto text-sm font-semibold text-primary hover:underline">Read more →</a>
						</div>
					</article>
				{:else}
					<p class="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted">
						{data.activeTag || data.activeMention ? 'No articles match this filter.' : 'No news yet. Check back once campaigns start posting.'}
					</p>
				{/each}
			</div>

			<Pagination
				page={data.page}
				{totalPages}
				total={data.total}
				itemLabel="articles"
				href={(p) => {
					const params = new URLSearchParams();
					if (data.activeTag) params.set('tag', data.activeTag);
					if (data.activeMention) params.set('mention', data.activeMention);
					params.set('page', String(p));
					return `/news?${params}`;
				}}
			/>
		</div>

		<!-- rhs: filter by topic tag or by a mentioned leader -->
		<div class="space-y-6 lg:col-span-1">
			<div>
				<p class="text-xs font-semibold tracking-wide text-muted uppercase">Tags</p>
				<div class="mt-2 flex flex-wrap gap-1.5">
					{#each data.tags as t (t.tag)}
						<a
							href={tagHref(t.tag)}
							class="rounded-full border px-2.5 py-1 text-xs font-medium transition {data.activeTag === t.tag
								? 'border-primary bg-primary-soft text-on-primary'
								: 'border-border bg-surface-2 text-muted hover:border-primary hover:text-primary'}"
						>
							{t.tag} <span class="opacity-70">({t.n})</span>
						</a>
					{:else}
						<p class="text-sm text-muted">No tags yet.</p>
					{/each}
				</div>
			</div>
			<div>
				<p class="text-xs font-semibold tracking-wide text-muted uppercase">Mentions</p>
				<div class="mt-2 flex flex-col gap-1.5">
					{#each data.mentions as m (m.slug)}
						<a
							href={mentionHref(m.slug)}
							class="flex items-center justify-between rounded-lg px-2 py-1 text-sm transition {data.activeMention === m.slug
								? 'bg-primary-soft font-semibold text-on-primary'
								: 'text-heading hover:bg-surface-2'}"
						>
							<span>@{m.name}</span>
							<span class="text-xs opacity-70">{m.n}</span>
						</a>
					{:else}
						<p class="text-sm text-muted">No mentions yet.</p>
					{/each}
				</div>
			</div>
		</div>
	</div>
</div>
