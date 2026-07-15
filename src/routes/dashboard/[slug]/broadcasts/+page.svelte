<script lang="ts">
	import { enhance } from '$app/forms';
	import Pagination from '$lib/components/admin/Pagination.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let sending = $state(false);
	const dateFmt = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
	const totalPages = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)));
</script>

<svelte:head><title>Broadcasts — leaders.ke</title></svelte:head>

<div class="grid gap-8 lg:grid-cols-5">
	<!-- Composer -->
	<div class="lg:col-span-2">
		<h2 class="text-lg font-semibold text-heading">Send a broadcast</h2>
		<p class="mt-1 text-sm text-muted">
			{data.audience.reachable} of {data.audience.total} followers reachable by email. SMS and
			WhatsApp arrive with credits.
		</p>

		{#if form?.error}
			<div class="mt-4 rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
				{form.error}
			</div>
		{/if}
		{#if form?.sent}
			<div class="mt-4 rounded-xl bg-primary-soft p-4 text-sm font-medium text-on-primary">
				Broadcast sent to {form.sent} follower{form.sent === 1 ? '' : 's'}.
			</div>
		{/if}

		<form
			method="post"
			action="?/send"
			class="mt-4 space-y-3"
			use:enhance={() => {
				sending = true;
				return async ({ update }) => {
					sending = false;
					await update();
				};
			}}
		>
			<label class="block">
				<span class="text-sm font-medium text-heading">Audience</span>
				<select
					name="audience"
					class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
				>
					<option value="all">All followers</option>
					{#each data.audience.counties as county (county)}
						<option value={`county:${county}`}>County: {county}</option>
					{/each}
					{#each data.audience.wards as ward (ward)}
						<option value={`ward:${ward}`}>Ward: {ward}</option>
					{/each}
				</select>
			</label>
			<input
				type="text"
				name="subject"
				required
				placeholder="Subject"
				class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
			/>
			<textarea
				name="body"
				rows="7"
				required
				placeholder="Your message to followers…"
				class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
			></textarea>
			<button
				type="submit"
				disabled={sending}
				class="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95 disabled:opacity-60"
			>
				{sending ? 'Sending…' : 'Send broadcast'}
			</button>
			<p class="text-xs leading-relaxed text-muted">
				Followers opted in on your public page and every message carries an opt-out (Kenya Data
				Protection Act, 2019).
			</p>
		</form>
	</div>

	<!-- History -->
	<div class="lg:col-span-3">
		<h2 class="text-lg font-semibold text-heading">
			Sent <span class="text-sm font-normal text-muted">({data.broadcasts.length})</span>
		</h2>

		<ul class="mt-4 space-y-4">
			{#each data.broadcasts as b (b.id)}
				<li class="rounded-2xl border border-border bg-surface p-5">
					<div class="flex flex-wrap items-start justify-between gap-2">
						<h3 class="font-semibold text-heading">{b.title}</h3>
						<span class="text-xs text-muted">{dateFmt.format(new Date(b.sentAt))}</span>
					</div>
					{#if b.summary}
						<p class="mt-1 text-xs font-medium text-primary">{b.summary}</p>
					{/if}
					<p class="mt-3 text-sm leading-relaxed whitespace-pre-line">{b.body}</p>
				</li>
			{:else}
				<li class="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
					No broadcasts yet. Your followers are waiting to hear from you.
				</li>
			{/each}
		</ul>
		<Pagination page={data.page} {totalPages} total={data.total} itemLabel="broadcasts" href={(p) => `?page=${p}`} />
	</div>
</div>
