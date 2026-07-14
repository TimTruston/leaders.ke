<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/auth/AuthCard.svelte';
	import Field from '$lib/components/auth/Field.svelte';
	import Submit from '$lib/components/auth/Submit.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let verifying = $state(false);
	// Tracked locally rather than off `form?.sent` — nesting the confirmCode
	// action's own error under a requestChange-shaped `form?.sent` check meant
	// TS (correctly) narrowed it to unreachable, since the two actions' results
	// are structurally disjoint and never both present at once.
	let sent = $state(false);
	let sentTo = $state('');
	let sending = $state(false);

	let cooldown = $state(data.cooldown);
	$effect(() => {
		if (cooldown <= 0) return;
		const t = setInterval(() => (cooldown = Math.max(0, cooldown - 1)), 1000);
		return () => clearInterval(t);
	});
</script>

<AuthCard title="Change email" subtitle={`Currently ${data.currentEmail}`}>
	{#if data.linkError}
		<p class="mb-4 rounded-lg bg-surface-2 px-4 py-3 text-sm text-heading">{data.linkError}</p>
	{/if}

	{#if sent}
		<p class="mb-4 rounded-lg bg-primary-soft px-4 py-3 text-sm text-on-primary">
			We sent a link and a code to {sentTo}.<br/> Click the link or enter the code below.
		</p>
		<form
			method="post"
			action="?/confirmCode"
			class="flex items-end gap-2"
			use:enhance={() => {
				verifying = true;
				return async ({ update }) => {
					verifying = false;
					await update({ reset: false });
				};
			}}
		>
			<label class="block flex-1">
				<span class="mb-1 block text-sm font-medium text-heading">Verification code</span>
				<input
					type="text"
					name="code"
					inputmode="numeric"
					maxlength="6"
					placeholder="123456"
					class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-heading placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
				/>
			</label>
			<button
				type="submit"
				disabled={verifying}
				class="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95 disabled:opacity-60"
			>
				Verify
			</button>
		</form>
		{#if form && 'codeError' in form && form.codeError}
			<p class="mt-2 text-sm text-red-500">{form.codeError}</p>
		{/if}
	{:else}
		<form
			method="post"
			action="?/requestChange"
			class="space-y-4"
			use:enhance={() => {
				sending = true;
				return async ({ result, update }) => {
					sending = false;
					if (result.type === 'success' && result.data?.sent) {
						sent = true;
						sentTo = result.data.newEmail as string;
						cooldown = 60;
					}
					await update();
				};
			}}
		>
			<Field label="New email" name="newEmail" type="email" autocomplete="email" required />
			{#if form && 'message' in form && form.message}
				<p class="text-sm text-red-500">{form.message}</p>
			{/if}
			<Submit disabled={sending || cooldown > 0}>
				{cooldown > 0 ? `Wait ${cooldown}s` : 'Send confirmation'}
			</Submit>
		</form>
	{/if}

	{#snippet footer()}
		<a href="/dashboard/account" class="font-semibold text-primary hover:underline">Back to account</a>
	{/snippet}
</AuthCard>
