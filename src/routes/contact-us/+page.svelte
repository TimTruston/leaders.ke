<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();

	let sending = $state(false);
</script>

<svelte:head>
	<title>Contact Us — leaders.ke</title>
	<meta name="description" content="Frequently asked questions and how to reach the leaders.ke team." />
</svelte:head>

<div class="mx-auto max-w-3xl px-4 py-12 sm:px-6">
	<h1 class="text-3xl font-bold text-heading">Contact Us</h1>
	<p class="mt-3 text-lg text-muted">
		Check the common questions first — if yours isn't there, write to us below.
	</p>

	<!-- FAQ pointer: the questions themselves live on /faq (searchable). -->
	<a
		href="/faq"
		class="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-5 transition hover:border-primary"
	>
		<span>
			<span class="block font-semibold text-heading">Frequently asked questions</span>
			<span class="mt-1 block text-sm text-muted">
				Claiming a page, verification, pricing, data — searchable answers for citizens, leaders, and teams.
			</span>
		</span>
		<span class="text-lg text-muted">→</span>
	</a>

	<!-- Contact form -->
	<section class="mt-10" aria-label="Contact form">
		<h2 class="text-lg font-semibold text-heading">Still need help? Write to us</h2>
		<p class="mt-1 text-sm text-muted">We reply to the email address you provide.</p>

		{#if form?.sent}
			<div class="mt-4 rounded-xl bg-primary-soft p-4 text-sm font-medium text-on-primary">
				Message sent — we'll get back to you soon.
			</div>
		{:else if form?.error}
			<div class="mt-4 rounded-xl border border-red-500/40 bg-red-500/5 p-4 text-sm font-medium text-red-500">
				{form.error}
			</div>
		{/if}

		{#if !form?.sent}
			<form
				method="post"
				action="?/send"
				class="mt-4 space-y-4 rounded-2xl border border-border bg-surface p-5"
				use:enhance={() => {
					sending = true;
					return async ({ update }) => {
						sending = false;
						await update({ reset: false });
					};
				}}
			>
				<!-- Honeypot (hidden from humans, bots fill it) -->
				<input type="text" name="website" tabindex="-1" autocomplete="off" class="hidden" aria-hidden="true" />

				<div class="grid gap-4 sm:grid-cols-2">
					<label class="block">
						<span class="text-sm font-medium text-heading">Your name <span class="text-red-500">*</span></span>
						<input
							type="text"
							name="name"
							required
							value={form?.name ?? ''}
							placeholder="Wanjiku Kamau"
							class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
						/>
					</label>
					<label class="block">
						<span class="text-sm font-medium text-heading">Your email <span class="text-red-500">*</span></span>
						<input
							type="email"
							name="email"
							required
							value={form?.email ?? ''}
							placeholder="you@email.com"
							class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
						/>
					</label>
				</div>

				<label class="block">
					<span class="text-sm font-medium text-heading">Topic</span>
					<select
						name="topic"
						value={form?.topic ?? 'General'}
						class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
					>
						<option>General</option>
						<option>Verification & claims</option>
						<option>Billing & pricing</option>
						<option>Data & privacy</option>
						<option>Press</option>
						<option>Report a problem</option>
					</select>
				</label>

				<label class="block">
					<span class="text-sm font-medium text-heading">Message <span class="text-red-500">*</span></span>
					<textarea
						name="message"
						required
						rows="6"
						maxlength="5000"
						placeholder="How can we help?"
						class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
						>{form?.message ?? ''}</textarea
					>
				</label>

				<button
					type="submit"
					disabled={sending}
					class="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition hover:brightness-95 disabled:opacity-60"
				>
					{sending ? 'Sending…' : 'Send message'}
				</button>
			</form>
		{/if}
	</section>
</div>
