<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();

	let sending = $state(false);

	const faqs = [
		{
			q: 'How do I claim my page?',
			a: 'Find your profile under Leaders, open it, and hit "Claim this profile". You\'ll confirm your details, upload your ID and IEBC clearance, and an admin reviews the claim.'
		},
		{
			q: 'How long does verification take?',
			a: "Most applications are reviewed within a few business days once every tab (Profile, Contacts, Team, Documentation, Signoff) is complete. You'll see the outcome, and any rejection reason, on your dashboard."
		},
		{
			q: 'What does it cost?',
			a: "Browsing, following, and reviewing are free for citizens. Campaigns pay a monthly subscription per the Pricing page, scaled to the office you're vying for."
		},
		{
			q: 'Is leaders.ke affiliated with any party or candidate?',
			a: 'No. The platform is party-neutral: every campaign gets the same tools on the same terms, and we never endorse candidates.'
		},
		{
			q: 'What happens to my personal data?',
			a: 'Your political choices are never shared, and campaign updates only reach channels you opted into. See the Privacy Policy and Data Policy for the full picture.'
		}
	];
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

	<!-- FAQ -->
	<section class="mt-8" aria-label="Frequently asked questions">
		<h2 class="text-lg font-semibold text-heading">Frequently asked questions</h2>
		<div class="mt-3 space-y-2">
			{#each faqs as faq (faq.q)}
				<details class="group rounded-2xl border border-border bg-surface p-4">
					<summary class="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-heading">
						{faq.q}
						<span class="text-muted transition group-open:rotate-180">⌄</span>
					</summary>
					<p class="mt-2 text-sm leading-relaxed text-muted">{faq.a}</p>
				</details>
			{/each}
		</div>
	</section>

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
