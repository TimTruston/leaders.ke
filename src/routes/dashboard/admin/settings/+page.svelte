<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let saving = $state(false);
</script>

<svelte:head><title>Platform settings — leaders.ke</title></svelte:head>

<div>
	<h1 class="text-xl font-bold text-heading">Platform settings</h1>
	<p class="mt-1 text-sm text-muted">Anti-abuse thresholds for OTP codes and campaign invites.</p>

	{#if form?.error}
		<div class="mt-4 rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">{form.error}</div>
	{:else if form?.saved}
		<div class="mt-4 rounded-xl bg-primary-soft p-4 text-sm font-medium text-on-primary">Saved.</div>
	{/if}

	<form
		method="post"
		action="?/save"
		class="mt-6 max-w-md space-y-5"
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
			<div class="mt-2 grid gap-3 sm:grid-cols-2">
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

		<div class="rounded-2xl border border-border bg-surface p-5">
			<h2 class="font-semibold text-heading">Lifetime invites per campaign</h2>
			<p class="mt-1 text-xs text-muted">
				Total invites a campaign may ever send, by subscription tier. <br/>
				No per-day limit for unique invitees.
			</p>
			<div class="mt-2 grid gap-3 sm:grid-cols-3">
				<label class="block">
					<span class="text-xs font-medium text-muted">Aspirant</span>
					<input
						type="number"
						name="aspirant"
						min="1"
						value={data.settings.inviteLimits.aspirant}
						class="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
					/>
				</label>
				<label class="block">
					<span class="text-xs font-medium text-muted">Influencer</span>
					<input
						type="number"
						name="influencer"
						min="1"
						value={data.settings.inviteLimits.influencer}
						class="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
					/>
				</label>
				<label class="block">
					<span class="text-xs font-medium text-muted">Mobilizer</span>
					<input
						type="number"
						name="mobilizer"
						min="1"
						value={data.settings.inviteLimits.mobilizer}
						class="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
					/>
				</label>
			</div>
		</div>

		<div class="rounded-2xl border border-border bg-surface p-5">
			<h2 class="font-semibold text-heading">Blocked slugs</h2>
			<p class="mt-1 text-xs text-muted">
				Words no leader may take as their public URL: the platform's own routes plus words kept for later use.
				Comma or space separated. Numeric-only slugs (e.g. 2027) are always blocked.
				Removing a route word lets a leader shadow that page — edit with care.
			</p>
			<textarea
				name="blockedSlugs"
				rows="5"
				value={data.settings.blockedSlugs.join(', ')}
				class="mt-2 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
			></textarea>
		</div>

		<button
			type="submit"
			disabled={saving}
			class="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition hover:brightness-95 disabled:opacity-60"
		>
			{saving ? 'Saving…' : 'Save settings'}
		</button>
	</form>
</div>
