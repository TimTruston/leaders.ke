<script lang="ts">
	import { enhance } from '$app/forms';
	import Pagination from '$lib/components/admin/Pagination.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const dateFmt = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
	const totalPages = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)));
</script>

<svelte:head><title>PR desk — leaders.ke</title></svelte:head>

{#if data.crisis}
	<!-- Crisis alert: mention volume spike in the last 24h -->
	<div class="mb-6 rounded-2xl border border-primary bg-primary-soft p-5">
		<p class="font-bold text-on-primary">⚠ Coverage spike: {data.mentions24h} mentions in 24 hours</p>
		<p class="mt-1 text-sm text-on-primary/90">
			Review the mentions below and get a response out before the story settles without your side.
			Sentiment-based alerts and team notifications arrive with the analysis pipeline.
		</p>
	</div>
{/if}

{#if form?.drafted}
	<div class="mb-6  rounded-xl bg-primary-soft p-4 text-sm font-medium text-on-primary">
		Draft created. Edit and publish it from <a href="/dashboard/posts" class="underline">Posts</a>.
	</div>
{/if}
{#if form?.error}
	<div class="mb-6  rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
		{form.error}
	</div>
{/if}

<div class="grid gap-8 lg:grid-cols-3">
	<!-- Mentions inbox -->
	<div class="lg:col-span-2">
		<h2 class="text-lg font-semibold text-heading">
			Mentions <span class="text-sm font-normal text-muted">({data.mentions.length})</span>
		</h2>
		<p class="mt-1 text-sm text-muted">
			News coverage tagged to you, aggregated daily from verified media.
		</p>

		<ul class="mt-4 space-y-3">
			{#each data.mentions as mention (mention.tagId)}
				<li class="rounded-2xl border border-border bg-surface p-5">
					<div class="flex flex-wrap items-baseline justify-between gap-2">
						<h3 class="font-semibold text-heading">{mention.title}</h3>
						<span class="text-xs text-muted">{dateFmt.format(new Date(mention.createdAt))}</span>
					</div>
					<p class="mt-2 text-sm leading-relaxed">{mention.summary}</p>
					<form method="post" action="?/draftResponse" class="mt-3" use:enhance>
						<input type="hidden" name="postId" value={mention.postId} />
						<button
							type="submit"
							class="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary transition hover:brightness-95"
						>
							Draft response
						</button>
					</form>
				</li>
			{:else}
				<li class="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
					No mentions yet. The aggregation pipeline tags coverage to your profile as it lands.
				</li>
			{/each}
		</ul>
		<Pagination page={data.page} {totalPages} total={data.total} itemLabel="mentions" href={(p) => `?page=${p}`} />
	</div>

	<!-- Drafts + social -->
	<div class="space-y-6">
		<div class="rounded-2xl border border-border bg-surface p-5">
			<h2 class="text-sm font-semibold tracking-wide text-muted uppercase">Response drafts</h2>
			<ul class="mt-3 space-y-2">
				{#each data.drafts as draft (draft.id)}
					<li class="text-sm">
						<a href="/dashboard/posts" class="font-medium text-heading hover:text-primary">
							{draft.title}
						</a>
					</li>
				{:else}
					<li class="text-sm text-muted">No drafts. "Draft response" on a mention creates one.</li>
				{/each}
			</ul>
			<a href="/dashboard/posts" class="mt-3 inline-block text-sm font-semibold text-primary hover:underline">
				Open Posts CMS →
			</a>
		</div>

		<!-- Social cross-posting: connectors land with the integrations work -->
		<div class="rounded-2xl border border-border bg-surface-2 p-5">
			<h2 class="text-sm font-semibold tracking-wide text-muted uppercase">Social cross-posting</h2>
			<p class="mt-2 text-sm leading-relaxed text-muted">
				Connect X and Facebook to cross-post broadcasts and approved responses in one click.
			</p>
			<div class="mt-3 flex gap-2">
				<button
					type="button"
					disabled
					class="rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-muted opacity-60"
				>
					Connect X (coming soon)
				</button>
				<button
					type="button"
					disabled
					class="rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-muted opacity-60"
				>
					Connect Facebook (coming soon)
				</button>
			</div>
		</div>
	</div>
</div>
