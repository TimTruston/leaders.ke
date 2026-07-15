<script lang="ts">
	import { enhance } from '$app/forms';
	import Reviews from '$lib/components/Reviews.svelte';
	import { renderRichText } from '$lib/utils/richtext';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const leader = $derived(data.leader);

	const fmt = new Intl.NumberFormat('en-KE');
	const dateFmt = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' });

	let following = $state(false);
	let asking = $state(false);

	const progress = $derived(
		data.fundraising.goal > 0
			? Math.min(100, Math.round((data.fundraising.raised / data.fundraising.goal) * 100))
			: 0
	);

	const deliveryLabel: Record<string, string> = {
		promised: 'Promised',
		in_progress: 'In progress',
		delivered: 'Delivered'
	};
</script>

<svelte:head>
	<title>{leader.name} for {leader.positionTitle} {data.year}, {leader.regionLabel} | leaders.ke</title>
	<meta
		name="description"
		content="{leader.name}'s {data.year} campaign for {leader.positionTitle} of {leader.regionLabel}: manifesto, delivery tracker, citizen reviews, fundraising and updates."
	/>
</svelte:head>

<section class="mx-auto max-w-7xl px-4 py-10 sm:px-6">
	<!-- Breadcrumb: leader / year -->
	<nav class="text-sm text-muted" aria-label="Breadcrumb">
		<a href={data.recordPath} class="hover:text-heading hover:underline">{leader.name}</a>
		<span class="mx-1">/</span>
		<span>{data.year}</span>
	</nav>

	<!-- Campaign banner -->
	<div class="mt-4 flex flex-wrap items-center justify-between gap-3">
		<span
			class="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-on-primary"
		>
			🚀 Active {data.year} campaign
		</span>
		<a href={data.recordPath} class="text-sm font-semibold text-primary hover:underline">
			View full profile →
		</a>
	</div>

	<div class="mt-4 grid gap-6 lg:grid-cols-3">
		<div class="lg:col-span-2">
			<!-- Candidate card -->
			<div class="rounded-3xl border border-border bg-surface p-6 sm:p-8">
				<div class="flex flex-col gap-5 sm:flex-row sm:items-center">
					<span
						class="grid size-20 shrink-0 place-items-center rounded-full bg-primary-soft text-3xl font-bold text-on-primary"
					>
						{leader.initials}
					</span>
					<div class="min-w-0">
						<h1 class="flex flex-wrap items-center gap-2 text-2xl font-extrabold text-heading sm:text-3xl">
							{leader.name}
							{#if leader.verified}
								<span
									class="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-on-primary"
								>
									<svg viewBox="0 0 24 24" fill="currentColor" class="size-4 text-primary">
										<path
											fill-rule="evenodd"
											d="M8.6 3.8a4.5 4.5 0 0 0-1.4 1 4.5 4.5 0 0 0-3.8 3.7 4.5 4.5 0 0 0 0 5 4.5 4.5 0 0 0 3.7 3.8 4.5 4.5 0 0 0 5 0 4.5 4.5 0 0 0 3.8-3.7 4.5 4.5 0 0 0 0-5 4.5 4.5 0 0 0-3.7-3.8 4.5 4.5 0 0 0-3.6-1Zm7 6.7a.75.75 0 1 0-1.2-.9l-3.2 4.3-1.7-1.7a.75.75 0 1 0-1 1l2.3 2.4a.75.75 0 0 0 1.1-.1l3.7-5Z"
											clip-rule="evenodd"
										/>
									</svg>
									Verified
								</span>
							{:else}
								<span
									class="inline-flex items-center rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-semibold text-muted"
								>
									Unverified
								</span>
							{/if}
						</h1>
						<p class="mt-1 text-sm text-muted">
							Vying for {leader.positionTitle}, {leader.regionLabel}
							{#if leader.party}· {leader.party}{/if}
						</p>
						<p class="mt-2 text-sm font-medium text-heading">
							{fmt.format(leader.followers)} followers · {fmt.format(data.pledgeCount)} vote pledges
						</p>
					</div>
				</div>

				{#if leader.bio}
					<!-- Bio is stored as markdown-lite (RichTextEditor); renderRichText
					escapes it before formatting, so {@html} is safe here. -->
					<div class="mt-6 space-y-3 leading-relaxed">{@html renderRichText(leader.bio)}</div>
				{/if}
			</div>

			<!-- Manifesto with public delivery tracker -->
			<div class="mt-6 rounded-3xl border border-border bg-surface p-6 sm:p-8">
				<h2 class="text-xl font-bold text-heading">Manifesto</h2>
				{#if leader.pillars.length > 0}
					<p class="mt-1 text-sm text-muted">
						{leader.pillars.length} pillar{leader.pillars.length === 1 ? '' : 's'}, each with a public
						delivery status
					</p>
					<ol class="mt-5 space-y-4">
						{#each leader.pillars as pillar, i (pillar.title)}
							<li class="rounded-2xl bg-surface-2 p-5">
								<div class="flex items-start gap-3">
									<span
										class="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-on-primary"
									>
										{i + 1}
									</span>
									<div class="min-w-0">
										<h3 class="flex flex-wrap items-center gap-2 font-semibold text-heading">
											{pillar.title}
											<span
												class="rounded-full px-2 py-0.5 text-xs font-semibold {pillar.deliveryStatus ===
												'delivered'
													? 'bg-primary text-on-primary'
													: pillar.deliveryStatus === 'in_progress'
														? 'bg-primary-soft text-on-primary'
														: 'border border-border bg-surface text-muted'}"
											>
												{deliveryLabel[pillar.deliveryStatus] ?? 'Promised'}
											</span>
										</h3>
										<p class="mt-1 text-sm leading-relaxed">{pillar.summary}</p>
										{#if pillar.evidence}
											<p class="mt-1 text-xs font-medium text-primary">Evidence: {pillar.evidence}</p>
										{/if}
									</div>
								</div>
							</li>
						{/each}
					</ol>
				{:else}
					<p class="mt-3 text-sm text-muted">No manifesto published yet.</p>
				{/if}
			</div>

			<!-- Updates: the campaign's public channel feed -->
			<div class="mt-6 rounded-3xl border border-border bg-surface p-6 sm:p-8">
				<h2 class="text-xl font-bold text-heading">Updates</h2>
				{#if data.posts.length > 0}
					<div class="mt-5 space-y-5">
						{#each data.posts as post (post.id)}
							<article class="border-b border-border pb-5 last:border-b-0 last:pb-0">
								<div class="flex flex-wrap items-baseline justify-between gap-2">
									<h3 class="font-semibold text-heading">{post.title}</h3>
									<span class="text-xs text-muted">{dateFmt.format(new Date(post.createdAt))}</span>
								</div>
								<p class="mt-2 text-sm leading-relaxed whitespace-pre-line">{post.body}</p>
							</article>
						{/each}
					</div>
				{:else}
					<p class="mt-3 text-sm text-muted">
						No public updates yet. Follow the campaign to hear first.
					</p>
				{/if}
			</div>

			<!-- Citizen reviews -->
			<Reviews
				leaderName={leader.name}
				positionTitle={leader.positionTitle}
				reviews={data.reviews}
				pillarOptions={data.reviewPillarOptions}
				signedIn={data.signedIn}
				flaggedReviewCounts={data.flaggedReviewCounts}
				myReview={data.myReview}
				{form}
			/>
		</div>

		<!-- Sidebar -->
		<div class="space-y-6">
			<!-- Follow -->
			<div class="rounded-3xl border border-border bg-surface p-6">
				<h2 class="text-lg font-bold text-heading">Follow this campaign</h2>
				<p class="mt-1 text-sm text-muted">
					Get updates from {leader.name.split(' ')[0]}'s campaign. No account needed.
				</p>

				{#if form?.followed}
					<div class="mt-4 rounded-2xl bg-primary-soft p-4 text-sm font-medium text-on-primary">
						Karibu {form.name}! You now follow this campaign and will get its broadcasts.
					</div>
				{:else}
					{#if form?.error}
						<div class="mt-4 rounded-2xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
							{form.error}
						</div>
					{/if}
					<form
						method="post"
						action="?/follow"
						class="mt-4 space-y-3"
						use:enhance={() => {
							following = true;
							return async ({ update }) => {
								following = false;
								await update();
							};
						}}
					>
						<input
							type="text"
							name="name"
							required
							placeholder="Your name"
							class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
						/>
						<input
							type="text"
							name="contact"
							required
							placeholder="Phone or email"
							class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
						/>
						<input
							type="text"
							name="ward"
							placeholder="Your ward (optional)"
							class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
						/>
						<button
							type="submit"
							disabled={following}
							class="w-full rounded-full bg-primary px-4 py-2.5 font-semibold text-on-primary transition hover:brightness-95 focus:ring-0 focus:ring-ring focus:outline-none disabled:opacity-60"
						>
							{following ? 'Following…' : 'Follow'}
						</button>
						<p class="text-xs leading-relaxed text-muted">
							You opt in to campaign updates and can opt out anytime. We never share your political
							choices (Kenya Data Protection Act, 2019).
						</p>
					</form>
				{/if}
			</div>

			<!-- Ask the campaign (AI) -->
			<div class="rounded-3xl border border-primary bg-surface p-6">
				<h2 class="text-lg font-bold text-heading">Ask {leader.name.split(' ')[0]}</h2>
				<p class="mt-1 text-sm text-muted">
					Answers come from the manifesto and public updates, instantly.
				</p>
				{#if form?.asked}
					<div class="mt-3 rounded-2xl bg-surface-2 p-4">
						<p class="text-xs font-semibold text-muted">You asked: {form.question}</p>
						<p class="mt-2 text-sm leading-relaxed whitespace-pre-line">{form.answer}</p>
						<p class="mt-2 text-xs text-muted">
							{form.answerSource === 'ai' ? 'AI answer, grounded in campaign material.' : 'Matched from campaign material.'}
						</p>
					</div>
				{/if}
				<form
					method="post"
					action="?/ask"
					class="mt-3 space-y-2"
					use:enhance={() => {
						asking = true;
						return async ({ update }) => {
							asking = false;
							await update();
						};
					}}
				>
					<textarea
						name="question"
						rows="2"
						required
						placeholder="e.g. What is the plan for water in my ward?"
						class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
					></textarea>
					<button
						type="submit"
						disabled={asking}
						class="w-full rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95 disabled:opacity-60"
					>
						{asking ? 'Thinking…' : 'Ask'}
					</button>
				</form>
			</div>

			<!-- Fundraising -->
			<div class="rounded-3xl border border-border bg-surface p-6">
				<h2 class="text-lg font-bold text-heading">Fund the campaign</h2>
				{#if data.fundraising.goal > 0}
					<p class="mt-2 text-sm">
						<span class="font-bold text-heading">KES {fmt.format(data.fundraising.raised)}</span>
						<span class="text-muted"> of KES {fmt.format(data.fundraising.goal)} ({progress}%)</span>
					</p>
					<div class="mt-2 h-3 overflow-hidden rounded-full bg-surface-2">
						<div class="h-full rounded-full bg-primary" style="width: {progress}%"></div>
					</div>
				{:else}
					<p class="mt-2 text-sm text-muted">
						KES {fmt.format(data.fundraising.raised)} raised so far.
					</p>
				{/if}

				{#if form?.donated}
					<div class="mt-3 rounded-2xl bg-primary-soft p-4 text-sm font-medium text-on-primary">
						Asante! Send KES {fmt.format(form.amount)} via M-Pesa to the campaign's till and the team
						will confirm it.
					</div>
				{:else}
					<form method="post" action="?/donate" class="mt-3 space-y-2" use:enhance>
						<input
							type="text"
							name="donorName"
							required
							placeholder="Your name"
							class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
						/>
						<div class="flex gap-2">
							<input
								type="text"
								name="phone"
								placeholder="M-Pesa phone (optional)"
								class="min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
							/>
							<input
								type="number"
								name="amount"
								required
								min="10"
								placeholder="KES"
								class="w-24 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
							/>
						</div>
						<button
							type="submit"
							class="w-full rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95"
						>
							Donate
						</button>
						<p class="text-xs leading-relaxed text-muted">
							Pledged donations are confirmed by the campaign team once received. M-Pesa STK push
							coming soon.
						</p>
					</form>
				{/if}
			</div>

			{#if !leader.verified}
				<div class="rounded-3xl bg-primary p-6 text-on-primary">
					<h2 class="text-lg font-bold text-on-primary">Is this you?</h2>
					<p class="mt-2 text-sm text-on-primary/80">
						Claim this profile, verify your candidature against IEBC records and unlock the full
						campaign toolkit.
					</p>
					<a
						href="/signup"
						class="mt-4 inline-block rounded-full bg-surface px-5 py-2.5 text-sm font-semibold text-heading transition hover:bg-surface-2"
					>
						Claim this profile
					</a>
				</div>
			{/if}
		</div>
	</div>
</section>
