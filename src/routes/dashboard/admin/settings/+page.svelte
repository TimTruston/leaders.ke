<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let saving = $state(false);
</script>

<svelte:head><title>Platform settings — leaders.ke</title></svelte:head>

<div>
	<h1 class="text-xl font-bold text-heading">Platform settings</h1>
	<p class="mt-1 text-sm text-muted">Anti-abuse thresholds, the application verification gate, and list pagination.</p>

	{#if form?.error}
		<div class="mt-4 rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">{form.error}</div>
	{:else if form?.saved}
		<div class="mt-4 rounded-xl bg-primary-soft p-4 text-sm font-medium text-on-primary">Saved.</div>
	{/if}

	<form
		method="post"
		action="?/save"
		class="mt-6 grid grid-cols-1 gap-5 md:grid-cols-3"
		use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				saving = false;
				await update({ reset: false });
			};
		}}
	>
		<div class="rounded-2xl border border-border bg-surface p-5">
			<h2 class="font-semibold text-heading">OTP codes, re-invites &amp; password resets</h2>
			<pre class="mt-1 text-xs text-muted">
Applies everywhere a code/link is sent
- signup verification,
- contact email changes
- forgot-password form
- re-inviting the same email for the same campaign role</pre>
			<div class="mt-2 space-y-3">
				<label class="block">
					<span class="text-xs font-medium text-muted">Cooldown (seconds)</span>
					<input
						type="number"
						name="otpCooldownSeconds"
						min="1"
						value={data.settings.otpCooldownSeconds}
						class="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
					/>
				</label>
				<label class="block">
					<span class="text-xs font-medium text-muted">Daily cap (per recipient)</span>
					<input
						type="number"
						name="otpDailyCap"
						min="1"
						value={data.settings.otpDailyCap}
						class="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
					/>
				</label>
			</div>
		</div>

		<!-- Lifetime invite limits live on the Packages page (part of what a package buys). -->

		<div class="rounded-2xl border border-border bg-surface p-5">
			<h2 class="font-semibold text-heading">Profile completeness checklist</h2>
			<p class="mt-1 text-xs text-muted">
				How many email-verified managers a campaign needs on its team, and how many of them must
				complete their own sign-off (role, national ID, and ID images) on the Team tab, before the
				profile checklist reads as complete.
			</p>
			<div class="mt-2 space-y-3">
				<label class="block">
					<span class="text-xs font-medium text-muted">Verified team members required</span>
					<input
						type="number"
						name="requiredTeamManagers"
						min="1"
						value={data.settings.requiredTeamManagers}
						class="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
					/>
				</label>
				<label class="block">
					<span class="text-xs font-medium text-muted">Sign-offs required</span>
					<input
						type="number"
						name="requiredSignoffs"
						min="1"
						value={data.settings.requiredSignoffs}
						class="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
					/>
				</label>
			</div>
		</div>

		<div class="rounded-2xl border border-border bg-surface p-5">
			<h2 class="font-semibold text-heading">Campaign verification gate</h2>
			<p class="mt-1 text-xs text-muted">
				Whether the "Verify Campaign" action on each of a profile's campaigns (Campaign tab)
				requires the IEBC Certificate of Clearance to already be uploaded. Leave off until closer
				to nominations — certificates aren't issued yet.
			</p>
			<label class="mt-2 flex items-center gap-2">
				<input
					type="checkbox"
					name="requireIebcForVerification"
					checked={data.settings.requireIebcForVerification}
					class="rounded border-border text-primary focus:ring-ring"
				/>
				<span class="text-sm text-heading">Require IEBC certificate before verifying a campaign</span>
			</label>
		</div>

		<div class="rounded-2xl border border-border bg-surface p-5">
			<h2 class="font-semibold text-heading">List pagination</h2>
			<p class="mt-1 text-xs text-muted">
				Rows per page on every paginated dashboard list: campaign posts, reviews, followers,
				broadcasts, PR mentions, the admin tables, and citizen invites.
			</p>
			<label class="mt-2 block">
				<span class="text-xs font-medium text-muted">Page size</span>
				<input
					type="number"
					name="pageSize"
					min="1"
					value={data.settings.pageSize}
					class="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
				/>
			</label>
		</div>

		<!-- The slug list needs room to breathe, so it spans the full grid width. -->
		<div class="rounded-2xl border border-border bg-surface p-5 md:col-span-3">
			<h2 class="font-semibold text-heading">Blocked slugs</h2>
			<p class="mt-1 text-xs text-muted">
				Words no leader may take as their public URL: the platform's own routes plus words kept for later use.
				Comma or space separated. Numeric-only slugs (e.g. 2027) are always blocked.
				Removing a route word lets a leader shadow that page, so edit with care.
			</p>
			<textarea
				name="blockedSlugs"
				rows="4"
				value={data.settings.blockedSlugs.join(', ')}
				class="mt-2 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
			></textarea>
		</div>

		<!-- AI Chat system prompts: how the assistant behaves everywhere (platform-wide)
		     and specifically when answering about one leader's profile. Both need room
		     to breathe, so each spans the full grid width. -->
		<div class="rounded-2xl border border-border bg-surface p-5 md:col-span-3">
			<h2 class="font-semibold text-heading">AI Chat — platform system prompt</h2>
			<p class="mt-1 text-xs text-muted">
				Governs the AI Chat assistant everywhere it runs, before any leader-specific instructions apply:
				overall tone, honesty rules, neutrality between candidates, and what it does when it doesn't know an answer.
			</p>
			<textarea
				name="platformSystemPrompt"
				rows="8"
				value={data.settings.platformSystemPrompt}
				class="mt-2 w-full rounded-xl border border-border bg-surface px-4 py-2.5 font-mono text-xs text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
			></textarea>
		</div>

		<div class="rounded-2xl border border-border bg-surface p-5 md:col-span-3">
			<h2 class="font-semibold text-heading">AI Chat — leader system prompt</h2>
			<p class="mt-1 text-xs text-muted">
				Layers on top of the platform prompt specifically for answers about one leader's own profile:
				how to represent their record and plans, and how to handle questions outside what they've published.
			</p>
			<textarea
				name="leaderSystemPrompt"
				rows="8"
				value={data.settings.leaderSystemPrompt}
				class="mt-2 w-full rounded-xl border border-border bg-surface px-4 py-2.5 font-mono text-xs text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
			></textarea>
		</div>

		<button
			type="submit"
			disabled={saving}
			class="justify-self-start rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition hover:brightness-95 disabled:opacity-60 md:col-span-3"
		>
			{saving ? 'Saving…' : 'Save settings'}
		</button>
	</form>
</div>
