<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import AuthCard from '$lib/components/auth/AuthCard.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let phoneCooldown = $state(data.phoneCooldown);
	let sendingCode = $state(false);
	let verifyingCode = $state(false);

	$effect(() => {
		if (phoneCooldown <= 0) return;
		const t = setInterval(() => {
			phoneCooldown = Math.max(0, phoneCooldown - 1);
		}, 1000);
		return () => clearInterval(t);
	});

</script>

<AuthCard title="Verify {data.phone}" subtitle="We texted a code to this number">
	<div class="space-y-2">
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
			<input type="hidden" name="phone" value={data.phone} />
			<input type="hidden" name="next" value={data.next} />
			<input type="hidden" name="scope" value={data.scope} />
			<input type="hidden" name="slug" value={data.slug ?? ''} />
			<label class="block flex-1">
				<div class="text-xs font-medium text-muted mb-2">Enter the SMS code</div>
				<div class="flex items-stretch">
					<input
						type="text"
						name="code"
						inputmode="numeric"
						maxlength="6"
						placeholder="123456"
						class="px-4 py-2.5 w-full rounded-l-xl border border-border bg-surface text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
					/>
					<button
						type="submit"
						disabled={verifyingCode}
						class="grid place-items-center px-4 py-2.5  rounded-r-xl bg-primary text-sm font-semibold text-on-primary transition hover:brightness-95 disabled:opacity-50"
					>
						Verify
					</button>
				</div>
			</label>
		</form>
		{#if form?.codeError}
			<p class="mt-1 text-sm text-red-500">{form.codeError}</p>
		{/if}
		{#if form?.phoneError}
			<p class="mt-1 text-sm text-red-500">{form.phoneError}</p>
		{:else if form?.phoneSent}
			<p class="mt-1 text-sm text-primary">Code sent.</p>
		{/if}
		<form
			method="post"
			action="?/sendPhoneCode"
			use:enhance={() => {
				sendingCode = true;
				return async ({ update }) => {
					sendingCode = false;
					phoneCooldown = 60;
					await update({ reset: false });
				};
			}}
		>
			<input type="hidden" name="phone" value={data.phone} />
			<input type="hidden" name="scope" value={data.scope} />
			<input type="hidden" name="slug" value={data.slug ?? ''} />
			<button
				type="submit"
				disabled={sendingCode || phoneCooldown > 0}
				class="mt-2 rounded-full bg-surface-2 px-3.5 py-1.5 text-xs font-semibold text-heading transition hover:brightness-95 disabled:opacity-50"
			>
				{phoneCooldown > 0 ? `Resend in ${phoneCooldown}s` : 'Resend code'}
			</button>
		</form>
	</div>
</AuthCard>
