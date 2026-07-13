<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const dateFmt = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
</script>

<svelte:head><title>Moderation — Admin</title></svelte:head>

<div>
	<h1 class="text-xl font-bold text-heading">Moderation</h1>
	<p class="mt-1 text-sm text-muted">
		Reviews flagged by a leader or manager, across every profile. Unflagging restores a review to
		public view.
	</p>

	{#if form?.error}
		<div class="mt-4 rounded-2xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
			{form.error}
		</div>
	{/if}

	{#if data.flagged.length > 0}
		<ul class="mt-6 space-y-3">
			{#each data.flagged as review (review.reviewId)}
				<li class="rounded-2xl border border-border bg-surface p-5">
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div class="min-w-0">
							<p class="text-sm text-heading">
								<span class="font-semibold">{review.reviewerName}</span>
								on <span class="font-semibold">{review.subjectName}</span>
							</p>
							<p class="mt-1 text-xs text-muted">{dateFmt.format(new Date(review.flaggedAt))}</p>
						</div>
						<span class="shrink-0 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold capitalize text-muted">
							Flagged as {review.reason.replace('_', ' ')}
						</span>
					</div>
					<p class="mt-3 text-sm leading-relaxed text-muted">{review.message}</p>
					<form method="post" action="?/unflag" class="mt-3" use:enhance>
						<input type="hidden" name="reviewId" value={review.reviewId} />
						<button
							type="submit"
							class="rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-heading transition hover:bg-surface-2"
						>
							Unflag
						</button>
					</form>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="mt-6 text-sm text-muted">No flagged reviews.</p>
	{/if}
</div>
