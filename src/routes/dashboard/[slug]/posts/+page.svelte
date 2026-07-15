<script lang="ts">
	import { enhance } from '$app/forms';
	import Pagination from '$lib/components/admin/Pagination.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const dateFmt = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
	const totalPages = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)));
</script>

<svelte:head><title>Posts — leaders.ke</title></svelte:head>

<div class="grid gap-8 lg:grid-cols-5">
	<!-- Composer -->
	<div class="lg:col-span-2">
		<h2 class="text-lg font-semibold text-heading">Write a post</h2>
		<p class="mt-1 text-sm text-muted">
			Public posts appear on your leader page and in your followers' channel feed.
		</p>

		{#if form?.error}
			<div class="mt-4 rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
				{form.error}
			</div>
		{/if}

		<form method="post" action="?/create" class="mt-4 space-y-3" use:enhance>
			<input
				type="text"
				name="title"
				required
				placeholder="Post title"
				class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
			/>
			<textarea
				name="body"
				rows="7"
				required
				placeholder="Your update: news, a promise, an event announcement…"
				class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
			></textarea>
			<label class="flex items-center gap-2 text-sm text-heading">
				<input type="checkbox" name="publish" checked class="rounded border-border text-primary focus:ring-ring" />
				Publish immediately
			</label>
			<button
				type="submit"
				class="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95"
			>
				Save post
			</button>
		</form>
	</div>

	<!-- Post list -->
	<div class="lg:col-span-3">
		<h2 class="text-lg font-semibold text-heading">
			Your posts <span class="text-sm font-normal text-muted">({data.posts.length})</span>
		</h2>

		<ul class="mt-4 space-y-4">
			{#each data.posts as post (post.id)}
				<li class="rounded-2xl border border-border bg-surface p-5">
					<div class="flex flex-wrap items-start justify-between gap-2">
						<div class="min-w-0">
							<h3 class="font-semibold text-heading">{post.title}</h3>
							<p class="mt-0.5 text-xs text-muted">{dateFmt.format(new Date(post.createdAt))}</p>
						</div>
						<span
							class="rounded-full px-2.5 py-0.5 text-xs font-semibold {post.isPublic
								? 'bg-primary-soft text-on-primary'
								: 'border border-border bg-surface-2 text-muted'}"
						>
							{post.isPublic ? 'Public' : 'Draft'}
						</span>
					</div>
					<p class="mt-3 text-sm leading-relaxed whitespace-pre-line">{post.body}</p>
					<div class="mt-4 flex gap-2">
						<form method="post" action="?/toggle" use:enhance>
							<input type="hidden" name="postId" value={post.id} />
							<button
								type="submit"
								class="rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-heading transition hover:bg-surface-2"
							>
								{post.isPublic ? 'Unpublish' : 'Publish'}
							</button>
						</form>
						<form method="post" action="?/remove" use:enhance>
							<input type="hidden" name="postId" value={post.id} />
							<button
								type="submit"
								class="rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-muted transition hover:bg-surface-2 hover:text-heading"
							>
								Delete
							</button>
						</form>
					</div>
				</li>
			{:else}
				<li class="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
					No posts yet. Your first update starts the public record.
				</li>
			{/each}
		</ul>
		<Pagination page={data.page} {totalPages} total={data.total} itemLabel="posts" href={(p) => `?page=${p}`} />
	</div>
</div>
