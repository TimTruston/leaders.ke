<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page as pageStore } from '$app/state';
	import Pagination from '$lib/components/admin/Pagination.svelte';
	import RichTextEditor from '$lib/components/RichTextEditor.svelte';
	import { plainText } from '$lib/utils/richtext';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const dateFmt = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
	const totalPages = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)));

	// lhs nav section, independent of the rhs top filter/sort.
	let navSection = $state<'social' | 'tags' | 'gallery' | null>(null);

	let composerOpen = $state(false);
	let composerBody = $state('');

	const setParam = (key: string, value: string) => {
		const url = new URL(pageStore.url);
		url.searchParams.set(key, value);
		url.searchParams.delete('page');
		goto(url, { keepFocus: true, noScroll: true });
	};

	const filters: { value: string; label: string }[] = [
		{ value: 'all', label: 'All' },
		{ value: 'posts', label: 'Posts' },
		{ value: 'events', label: 'Events' },
		{ value: 'mentions', label: 'Mentions' },
		{ value: 'drafts', label: 'Drafts' }
	];
	const sorts: { value: string; label: string }[] = [
		{ value: 'recent', label: 'Recent' },
		{ value: 'oldest', label: 'Oldest' },
		{ value: 'views', label: 'Views' },
		{ value: 'likes', label: 'Likes' }
	];
</script>

<svelte:head><title>News — leaders.ke</title></svelte:head>

{#if data.crisis}
	<div class="mb-6 rounded-2xl border border-primary bg-primary-soft p-5">
		<p class="font-bold text-on-primary">⚠ Coverage spike: {data.mentions24h} mentions in 24 hours</p>
		<p class="mt-1 text-sm text-on-primary/90">
			Review the mentions below and get a response out before the story settles without your side.
		</p>
	</div>
{/if}
{#if form?.drafted}
	<div class="mb-6 rounded-xl bg-primary-soft p-4 text-sm font-medium text-on-primary">Draft response created below.</div>
{/if}
{#if form?.error}
	<div class="mb-6 rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">{form.error}</div>
{/if}

<div class="grid gap-8 lg:grid-cols-4">
	<!-- lhs nav -->
	<div class="space-y-1 lg:col-span-1">
		<button
			type="button"
			onclick={() => { navSection = null; setParam('section', 'feed'); }}
			class="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold transition {navSection === null && data.section === 'feed'
				? 'bg-primary-soft text-on-primary'
				: 'text-heading hover:bg-surface-2'}"
		>
			Feed
		</button>
		<button
			type="button"
			onclick={() => { navSection = null; setParam('filter', 'drafts'); }}
			class="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold transition {navSection === null && data.filter === 'drafts'
				? 'bg-primary-soft text-on-primary'
				: 'text-heading hover:bg-surface-2'}"
		>
			Drafts <span class="text-xs font-normal text-muted">({data.drafts.length})</span>
		</button>
		<button
			type="button"
			onclick={() => (navSection = navSection === 'social' ? null : 'social')}
			class="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold transition {navSection === 'social'
				? 'bg-primary-soft text-on-primary'
				: 'text-heading hover:bg-surface-2'}"
		>
			Social cross-posting
		</button>
		<button
			type="button"
			onclick={() => (navSection = navSection === 'tags' ? null : 'tags')}
			class="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold transition {navSection === 'tags'
				? 'bg-primary-soft text-on-primary'
				: 'text-heading hover:bg-surface-2'}"
		>
			Tags
		</button>
		<button
			type="button"
			onclick={() => { navSection = null; setParam('section', data.section === 'archive' ? 'feed' : 'archive'); }}
			class="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold transition {data.section === 'archive'
				? 'bg-primary-soft text-on-primary'
				: 'text-heading hover:bg-surface-2'}"
		>
			Archive
		</button>
		<button
			type="button"
			onclick={() => (navSection = navSection === 'gallery' ? null : 'gallery')}
			class="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold transition {navSection === 'gallery'
				? 'bg-primary-soft text-on-primary'
				: 'text-heading hover:bg-surface-2'}"
		>
			Gallery
		</button>

		{#if navSection === 'social'}
			<div class="mt-3 rounded-2xl border border-border bg-surface-2 p-4">
				<p class="text-sm leading-relaxed text-muted">
					Connect X and Facebook to cross-post approved posts and responses in one click.
				</p>
				<div class="mt-3 flex flex-col gap-2">
					<button type="button" disabled class="rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-muted opacity-60">
						Connect X (coming soon)
					</button>
					<button type="button" disabled class="rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-muted opacity-60">
						Connect Facebook (coming soon)
					</button>
				</div>
			</div>
		{:else if navSection === 'tags'}
			<div class="mt-3 rounded-2xl border border-border bg-surface-2 p-4">
				<p class="text-xs font-semibold tracking-wide text-muted uppercase">Post tags</p>
				<div class="mt-2 flex flex-wrap gap-1.5">
					{#each data.tags as tag (tag)}
						<span class="rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-heading">{tag}</span>
					{:else}
						<p class="text-sm text-muted">No tags yet. Add some when writing a post.</p>
					{/each}
				</div>
			</div>
		{:else if navSection === 'gallery'}
			<div class="mt-3 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
				Gallery is coming soon — a media library for post images and event photos.
			</div>
		{/if}
	</div>

	<!-- rhs feed -->
	<div class="lg:col-span-3">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="flex flex-wrap gap-1.5">
				{#each filters as f (f.value)}
					<button
						type="button"
						onclick={() => { navSection = null; setParam('filter', f.value); }}
						class="rounded-full border px-3.5 py-1.5 text-xs font-semibold transition {data.filter === f.value
							? 'border-primary bg-primary-soft text-on-primary'
							: 'border-border text-heading hover:bg-surface-2'}"
					>
						{f.label}
					</button>
				{/each}
			</div>
			<div class="flex items-center gap-2">
				<select
					value={data.sort}
					onchange={(e) => setParam('sort', e.currentTarget.value)}
					class="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-heading focus:border-primary focus:ring-0 focus:outline-none"
				>
					{#each sorts as s (s.value)}
						<option value={s.value}>Sort: {s.label}</option>
					{/each}
				</select>
				<button
					type="button"
					onclick={() => (composerOpen = !composerOpen)}
					class="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary transition hover:brightness-95"
				>
					{composerOpen ? 'Close' : 'New Post'}
				</button>
			</div>
		</div>

		<!-- Composer: slides down above the feed, slides out on submit. -->
		<div class="grid transition-all duration-300 ease-out {composerOpen ? 'mt-4 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}">
			<div class="overflow-hidden">
				<form
					method="post"
					action="?/create"
					class="space-y-3 rounded-2xl border border-border bg-surface p-5"
					use:enhance={() => {
						return async ({ update }) => {
							await update();
							composerOpen = false;
							composerBody = '';
						};
					}}
				>
					<input
						type="text"
						name="title"
						required
						placeholder="Post title"
						class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
					/>
					<RichTextEditor bind:value={composerBody} name="body" rows={6} placeholder="Your update: news, a promise, an event announcement…" required />
					<input
						type="text"
						name="tags"
						placeholder="Tags, comma separated (e.g. healthcare, roads)"
						class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
					/>
					<div class="flex justify-end gap-2">
						<button
							type="submit"
							name="publish"
							value=""
							class="rounded-full border border-border px-4 py-2 text-sm font-semibold text-heading transition hover:bg-surface-2"
						>
							Save draft
						</button>
						<button
							type="submit"
							name="publish"
							value="on"
							class="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95"
						>
							Publish
						</button>
					</div>
				</form>
			</div>
		</div>

		<ul class="mt-4 space-y-4">
			{#each data.items as item (item.kind + item.id)}
				<li class="rounded-2xl border border-border bg-surface p-5">
					<div class="flex flex-wrap items-start justify-between gap-2">
						<div class="min-w-0">
							<h3 class="font-semibold text-heading">
								{#if item.kind === 'post' && item.isPublic && item.slug}
									<a href="/news/{item.slug}" class="hover:text-primary hover:underline">{item.title}</a>
								{:else}
									{item.title}
								{/if}
							</h3>
							<p class="mt-0.5 text-xs text-muted">
								{#if item.kind === 'post'}
									{data.authorName} ·
								{/if}
								{item.kind === 'event' && item.startAt ? dateFmt.format(new Date(item.startAt)) : dateFmt.format(new Date(item.createdAt))}
								{#if item.kind === 'event' && item.venue}
									· {item.venue}
								{/if}
							</p>
						</div>
						<span
							class="rounded-full px-2.5 py-0.5 text-xs font-semibold {item.kind === 'event'
								? 'bg-surface-2 text-heading'
								: item.kind === 'mention'
									? 'border border-border bg-surface-2 text-muted'
									: item.isPublic
										? 'bg-primary-soft text-on-primary'
										: 'border border-border bg-surface-2 text-muted'}"
						>
							{item.kind === 'event' ? 'Event' : item.kind === 'mention' ? 'Mention' : item.isPublic ? 'Public' : 'Draft'}
						</span>
					</div>

					{#if item.kind === 'post'}
						<p class="mt-3 text-sm leading-relaxed text-muted">{plainText(item.body).slice(0, 250)}{plainText(item.body).length > 250 ? '…' : ''}</p>
						{#if item.tags?.length}
							<div class="mt-2 flex flex-wrap gap-1.5">
								{#each item.tags as tag (tag)}
									<span class="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs text-muted">{tag}</span>
								{/each}
							</div>
						{/if}
						<div class="mt-3 flex flex-wrap items-center justify-between gap-2">
							<p class="text-xs text-muted">{item.views ?? 0} views · {item.votes ?? 0} likes</p>
							<div class="flex gap-2">
								<form method="post" action="?/toggle" use:enhance>
									<input type="hidden" name="postId" value={item.id} />
									<button type="submit" class="rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-heading transition hover:bg-surface-2">
										{item.isPublic ? 'Unpublish' : 'Publish'}
									</button>
								</form>
								<form method="post" action={data.section === 'archive' ? '?/restore' : '?/archive'} use:enhance>
									<input type="hidden" name="postId" value={item.id} />
									<button type="submit" class="rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-heading transition hover:bg-surface-2">
										{data.section === 'archive' ? 'Restore' : 'Archive'}
									</button>
								</form>
								<form method="post" action="?/remove" use:enhance>
									<input type="hidden" name="postId" value={item.id} />
									<button type="submit" class="rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-muted transition hover:bg-surface-2 hover:text-heading">
										Delete
									</button>
								</form>
							</div>
						</div>
					{:else if item.kind === 'event'}
						<p class="mt-3 text-sm leading-relaxed whitespace-pre-line">{item.body}</p>
					{:else}
						<p class="mt-2 text-sm leading-relaxed">{item.body}</p>
						<form method="post" action="?/draftResponse" class="mt-3" use:enhance>
							<input type="hidden" name="postId" value={item.id} />
							<button type="submit" class="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary transition hover:brightness-95">
								Draft response
							</button>
						</form>
					{/if}
				</li>
			{:else}
				<li class="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
					Nothing here yet.
				</li>
			{/each}
		</ul>
		<Pagination page={data.page} {totalPages} total={data.total} itemLabel="items" href={(p) => {
			const url = new URL(pageStore.url);
			url.searchParams.set('page', String(p));
			return `${url.pathname}${url.search}`;
		}} />
	</div>
</div>
