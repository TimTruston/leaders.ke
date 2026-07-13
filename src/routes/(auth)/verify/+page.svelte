<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import AuthCard from '$lib/components/auth/AuthCard.svelte';
	import PhoneInput from '$lib/components/contact/PhoneInput.svelte';
	import { normalizeKenyanPhone } from '$lib/utils/phone';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let phone = $state(data.phone);
	const phoneValid = $derived(!!normalizeKenyanPhone(phone));
	let emailCooldown = $state(data.emailCooldown);
	let phoneCooldown = $state(data.phoneCooldown);
	let sendingEmail = $state(false);
	let sendingCode = $state(false);
	let verifyingCode = $state(false);

	$effect(() => {
		if (emailCooldown <= 0 && phoneCooldown <= 0) return;
		const t = setInterval(() => {
			emailCooldown = Math.max(0, emailCooldown - 1);
			phoneCooldown = Math.max(0, phoneCooldown - 1);
		}, 1000);
		return () => clearInterval(t);
	});

	$effect(() => {
		if (data.emailVerified && data.phoneVerified) goto(data.next);
	});
</script>

<AuthCard title="Verify your account" subtitle="Confirm your email and phone number to continue">
	<div class="space-y-6">
		<div>
			<div class="flex items-center justify-between">
				<span class="text-sm font-medium text-heading">Email — {data.email}</span>
				{#if data.emailVerified}
					<span class="text-sm font-medium text-primary">Verified ✓</span>
				{/if}
			</div>
			{#if !data.emailVerified}
				<p class="mt-1 text-sm text-muted">We'll send a verification code and link.</p>
				{#if form?.emailError}
					<p class="mt-1 text-sm text-red-500">{form.emailError}</p>
				{:else if form?.emailSent}
					<p class="mt-1 text-sm text-primary">Code sent.</p>
				{/if}
				<form
					method="post"
					action="?/sendEmailCode"
					use:enhance={() => {
						sendingEmail = true;
						return async ({ update }) => {
							sendingEmail = false;
							emailCooldown = 60;
							await update({ reset: false });
						};
					}}
				>
					<button
						type="submit"
						disabled={sendingEmail || emailCooldown > 0}
						class="mt-2 rounded-full bg-surface-2 px-3.5 py-1.5 text-xs font-semibold text-heading transition hover:brightness-95 disabled:opacity-50"
					>
						{emailCooldown > 0 ? `Resend in ${emailCooldown}s` : data.emailCooldown > 0 || form?.emailSent ? 'Resend code' : 'Send code'}
					</button>
				</form>
			{/if}
		</div>

		<div class="border-t border-border pt-6">
			<div class="flex items-center justify-between">
				<span class="text-sm font-medium text-heading">Phone number</span>
				{#if data.phoneVerified}
					<span class="text-sm font-medium text-primary">Verified ✓</span>
				{/if}
			</div>

			{#if !data.phoneVerified}
				<form
					method="post"
					action="?/sendPhoneCode"
					class="mt-2 space-y-2"
					use:enhance={() => {
						sendingCode = true;
						return async ({ update }) => {
							sendingCode = false;
							phoneCooldown = 60;
							await update();
						};
					}}
				>
					<PhoneInput bind:value={phone} label="SMS number" />
					<input type="hidden" name="phone" value={phone} />
					{#if form?.phoneError}
						<p class="text-sm text-red-500">{form.phoneError}</p>
					{:else if form?.phoneSent}
						<p class="text-sm text-primary">Code sent.</p>
					{/if}
					<button
						type="submit"
						disabled={sendingCode || phoneCooldown > 0 || !phoneValid}
						class="rounded-full bg-surface-2 px-3.5 py-1.5 text-xs font-semibold text-heading transition hover:brightness-95 disabled:opacity-50"
					>
						{phoneCooldown > 0 ? `Resend in ${phoneCooldown}s` : data.phone ? 'Resend code' : 'Send code'}
					</button>
				</form>
			{/if}
		</div>

		{#if !data.emailVerified || !data.phoneVerified}
			<div class="border-t border-border pt-6">
				<!-- One box verifies whichever channel the code was sent to (email or sms). -->
				<form
					method="post"
					action="?/verifyCode"
					class="flex items-end gap-2"
					use:enhance={() => {
						verifyingCode = true;
						return async ({ result, update }) => {
							verifyingCode = false;
							if (result.type === 'success') await invalidateAll();
							await update();
						};
					}}
				>
					<label class="block flex-1">
						<span class="text-xs font-medium text-muted">{#if data.phoneVerified}Email {/if}{#if data.emailVerified}SMS {/if} Verification code</span>
						<input
							type="text"
							name="code"
							inputmode="numeric"
							maxlength="6"
							placeholder="123456"
							class="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
						/>
					</label>
					<button
						type="submit"
						disabled={verifyingCode}
						class="shrink-0 rounded-full bg-primary px-3.5 py-2.5 text-xs font-semibold text-on-primary transition hover:brightness-95 disabled:opacity-50"
					>
						Verify
					</button>
				</form>
				{#if form?.codeError}
					<p class="mt-1 text-sm text-red-500">{form.codeError}</p>
				{/if}
			</div>
		{/if}
	</div>
</AuthCard>
