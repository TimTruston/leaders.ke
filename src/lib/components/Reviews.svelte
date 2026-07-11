<script lang="ts">
	import { enhance } from '$app/forms';
	import ReviewFilter from '$lib/components/ReviewFilter.svelte';
	import { filterAndSortReviews } from '$lib/reviewFilter';

	type ReviewItem = {
		id: number;
		rating: number;
		message: string;
		pillarTitle: string | null;
		likes: number;
		authorName: string | null; // null renders as "Anonymous"
		createdAt: string;
		response: { body: string; createdAt: string } | null;
		// Only ever populated on the viewer's own review; other people's flagged
		// reviews are excluded from the list entirely.
		flagReason: string | null;
	};

	function flagLabel(reason: string): string {
		return reason.replace('_', ' ');
	}

	const FLAG_REASON_LABELS: Record<string, string> = {
		spam: 'spam',
		insult: 'insults',
		incitement: 'incitement',
		hate_speech: 'hate speech',
		misinformation: 'misinformation',
		other: 'other reasons'
	};

	type MyReview = {
		id: number;
		rating: number;
		message: string;
		pillarId: number | null;
		public: boolean;
		hasResponse: boolean;
		flagReason: string | null;
	};

	type Props = {
		leaderName: string;
		positionTitle: string;
		reviews: ReviewItem[];
		pillarOptions: { id: number; title: string }[];
		signedIn: boolean;
		flaggedReviewCounts: { total: number; byReason: Partial<Record<string, number>> };
		myReview: MyReview | null;
		// The signed-in viewer's own name, to label their own private review
		// instead of showing them "Anonymous" for a review that's theirs.
		viewerName: string | null;
		// The page's form action result, for success/error feedback
		form?: { reviewed?: boolean; updated?: boolean; deleted?: boolean; reviewError?: string } | null;
	};

	let {
		leaderName,
		positionTitle,
		reviews,
		pillarOptions,
		signedIn,
		flaggedReviewCounts,
		myReview,
		viewerName,
		form
	}: Props = $props();

	const fmt = new Intl.NumberFormat('en-KE');
	const dateFmt = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' });

	const MESSAGE_MAX_LENGTH = 500;

	let editing = $state(false);
	let rating = $state(0);
	let hovered = $state(0);
	let submitting = $state(false);
	let message = $state('');
	let pillarId = $state<number | ''>('');
	let publicChecked = $state(false);

	function startEdit() {
		if (!myReview || myReview.hasResponse || myReview.flagReason) return;
		rating = myReview.rating;
		message = myReview.message;
		pillarId = myReview.pillarId ?? '';
		publicChecked = myReview.public;
		editing = true;
	}

	const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

	let filterRating = $state<number | ''>('');
	let filterPillarTitle = $state('');
	let sortBy = $state<'recent' | 'likes'>('recent');
	let sortDir = $state<'asc' | 'desc'>('desc');

	const filteredReviews = $derived(
		filterAndSortReviews(reviews, {
			rating: filterRating,
			pillarTitle: filterPillarTitle,
			sortBy,
			sortDir
		})
	);
</script>

<div class="mt-6 rounded-3xl border border-border bg-surface p-6 sm:p-8">
	<h2 class="text-xl font-bold text-heading">Reviews</h2>

	{#if reviews.length > 0}
		<div class="mt-4">
			<ReviewFilter
				{pillarOptions}
				bind:rating={filterRating}
				bind:pillarTitle={filterPillarTitle}
				bind:sortBy
				bind:sortDir
			/>
		</div>
		<div class="mt-5 space-y-5">
			{#each filteredReviews as review (review.id)}
				<article class="border-b border-border pb-5 last:border-b-0 last:pb-0">
					<div class="flex flex-wrap items-baseline justify-between gap-2">
						<span class="flex gap-1 text-sm tracking-widest text-primary">
							<span aria-label="Author's name">
								{review.authorName ??
									(myReview && myReview.id === review.id ? `${viewerName} (Private)` : 'Anonymous')}
							</span>
							<span aria-label="{review.rating} out of 5 stars">
								{stars(review.rating)}
							</span>
						</span>
						<span class="flex gap-1 font-normal text-xs text-muted">
							{#if review.pillarTitle}
								<span aria-label="Pillar title">{review.pillarTitle}</span>
							{/if}
							{#if review.likes > 0}
								<span aria-label="{review.likes} likes">{fmt.format(review.likes)} like{review.likes === 1 ? '' : 's'}</span>
							{/if}
							<span aria-label="Created at">{dateFmt.format(new Date(review.createdAt))}</span>
						</span>
					</div>
					{#if editing && myReview && myReview.id === review.id}
						{@render reviewForm()}
					{:else}
						<p class="mt-2 text-sm leading-relaxed whitespace-pre-line">{review.message}</p>
						<div class="mt-2 flex *:flex-wrap items-center justify-between gap-2">
							
							{#if myReview && myReview.id === review.id}
								{#if review.flagReason}
									<span class="w-fit rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-muted">
										Flagged as {flagLabel(review.flagReason)}
									</span>
								{/if}
								<div class="flex flex-wrap gap-3 ml-auto">
									{#if !review.response && !review.flagReason}
										<button
											type="button"
											onclick={startEdit}
											class="rounded-full border border-border px-3 py-1 text-xs text-muted transition hover:bg-surface-2"
										>
											Edit
										</button>
									{/if}
									<form
										method="post"
										action="?/deleteReview"
										use:enhance={({ cancel }) => {
											if (!confirm('Delete your review? This cannot be undone.')) cancel();
											return async ({ update }) => {
												await update();
											};
										}}
									>
										<button
											type="submit"
											class="rounded-full border border-border px-3 py-1 text-xs text-muted transition hover:bg-surface-2"
										>
											Delete
										</button>
									</form>
								</div>
							{/if}
						</div>
						{#if review.response}
							<div class="mt-3 rounded-xl bg-surface-2 p-3 text-sm">
								<p class="text-xs font-semibold text-heading">Response from {leaderName}</p>
								<p class="mt-1 whitespace-pre-line">{review.response.body}</p>
							</div>
						{/if}
					{/if}
				</article>
			{:else}
				<p class="text-sm text-muted">No reviews match those filters.</p>
			{/each}
		</div>
	{:else}
		<p class="mt-3 text-sm text-muted">No public reviews yet. Be the first to review.</p>
	{/if}

	{#if flaggedReviewCounts.total > 0}
		<p class="mt-4 text-xs text-muted">
			{flaggedReviewCounts.total} flagged review{flaggedReviewCounts.total === 1 ? '' : 's'}
			({Object.entries(flaggedReviewCounts.byReason)
				.map(([reason, n]) => `${n} ${FLAG_REASON_LABELS[reason] ?? reason}`)
				.join(', ')})
		</p>
	{/if}

	<!-- Shared review form body: rendered inline in the list when editing an
	existing review, or in the bottom section below when leaving a first one. -->
	{#snippet reviewForm()}
		{#if form?.reviewError}
			<div class="mt-2 rounded-2xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
				{form.reviewError}
			</div>
		{/if}
		<form
			method="post"
			action="?/review"
			class="mt-2 space-y-3"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					submitting = false;
					editing = false;
					await update();
				};
			}}
		>
			<textarea
				name="message"
				rows="3"
				required
				maxlength={MESSAGE_MAX_LENGTH}
				bind:value={message}
				placeholder="Leave a review"
				class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
			></textarea>
			<p class="text-right text-xs text-muted">{message.length}/{MESSAGE_MAX_LENGTH}</p>

			<!-- Pillar (optional) next to the required star rating; stacks on phones -->
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
				<select
					name="pillarId"
					bind:value={pillarId}
					class="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none sm:max-w-60"
				>
					<option value="">General</option>
					{#each pillarOptions as pillar (pillar.id)}
						<option value={pillar.id}>{pillar.title}</option>
					{/each}
				</select>
				<div class="flex items-center gap-1" role="radiogroup" aria-label="Star rating">
					{#each [1, 2, 3, 4, 5] as star (star)}
						<button
							type="button"
							role="radio"
							aria-checked={rating === star}
							aria-label="{star} star{star === 1 ? '' : 's'}"
							onclick={() => (rating = star)}
							onmouseenter={() => (hovered = star)}
							onmouseleave={() => (hovered = 0)}
							class="text-2xl leading-none transition {star <= (hovered || rating)
								? 'text-primary'
								: 'text-muted'}"
						>
							{star <= (hovered || rating) ? '★' : '☆'}
						</button>
					{/each}
				</div>
				<input type="hidden" name="rating" value={rating || ''} required />
			</div>

			<!-- Public checkbox next to the submit button; stacks on phones -->
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
				<label class="flex items-center gap-2 text-sm text-heading">
					<input
						type="checkbox"
						name="public"
						bind:checked={publicChecked}
						class="size-4 rounded border-border text-primary focus:ring-2 focus:ring-ring"
					/>
					Public (with your name)
				</label>
				<button
					type="submit"
					disabled={submitting || rating === 0}
					class="w-fit rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95 disabled:opacity-60"
				>
					{submitting ? 'Posting…' : myReview ? 'Save changes' : 'Leave a Review'}
				</button>
				{#if myReview}
					<button
						type="button"
						onclick={() => (editing = false)}
						class="text-sm font-medium text-muted transition hover:text-heading"
					>
						Cancel
					</button>
				{/if}
			</div>
		</form>
	{/snippet}

	<!-- Bottom section: sign-in prompt, the just-deleted notice, or the first-review
	form. Once a review exists it's edited/deleted in place in the list above, so
	nothing repeats down here. -->
	{#if !signedIn || form?.deleted || !myReview}
		<div class="mt-6 border-t border-border pt-6">
			{#if !signedIn}
				<h3 class="font-semibold text-heading">Review {positionTitle} {leaderName}</h3>
				<p class="mt-3 text-sm text-muted">
					<a href="/login" class="font-semibold text-primary hover:underline">Sign in</a>
					to leave a review.
				</p>
			{:else if form?.deleted}
				<div class="rounded-2xl bg-primary-soft p-4 text-sm font-medium text-on-primary">
					Your review has been deleted.
				</div>
			{:else}
				<h3 class="font-semibold text-heading">Review {positionTitle} {leaderName}</h3>
				{@render reviewForm()}
			{/if}
		</div>
	{/if}
</div>
