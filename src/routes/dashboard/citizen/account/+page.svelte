<script lang="ts">
	import { enhance } from '$app/forms';
	import PhoneInput from '$lib/components/contact/PhoneInput.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// PhoneInput only exposes `value` (bindable), no `name` — a hidden input carries
	// the bound value into the form's native submission.
	let smsPhone = $state(data.smsPhone);
	let whatsappPhone = $state(data.whatsappPhone);

	const notifyChannels = [
		{
			name: 'notifyEmail',
			label: 'Email',
			checked: data.notificationPrefs.email,
			icon: 'M2.25 6.75c0-.83.67-1.5 1.5-1.5h16.5c.83 0 1.5.67 1.5 1.5v10.5a1.5 1.5 0 0 1-1.5 1.5H3.75a1.5 1.5 0 0 1-1.5-1.5V6.75Zm1.72-.19 8.03 5.5 8.03-5.5'
		},
		{
			name: 'notifySms',
			label: 'SMS',
			checked: data.notificationPrefs.sms,
			icon: 'M3 5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25v9a2.25 2.25 0 0 1-2.25 2.25H9l-4.5 4.5v-4.5H5.25A2.25 2.25 0 0 1 3 14.25v-9Z'
		},
		{
			name: 'notifyWhatsapp',
			label: 'WhatsApp',
			checked: data.notificationPrefs.whatsapp,
			icon: 'M12 3a9 9 0 0 0-7.76 13.56L3 21l4.6-1.21A9 9 0 1 0 12 3Zm4.64 12.3c-.2.55-1.13 1.04-1.6 1.1-.4.06-.9.09-1.46-.09-.33-.11-.77-.25-1.32-.5-2.32-1-3.84-3.35-3.95-3.5-.12-.16-.94-1.25-.94-2.38s.6-1.7.8-1.93c.2-.23.44-.29.6-.29h.42c.14 0 .3 0 .46.35.2.42.66 1.45.72 1.55.06.11.1.24.02.4-.08.16-.12.25-.24.38-.12.14-.25.3-.36.4-.12.12-.24.24-.1.48.14.24.6 1 1.3 1.62.9.8 1.65 1.05 1.9 1.17.24.12.38.1.52-.06.16-.16.6-.7.76-.94.16-.24.32-.2.53-.12.22.08 1.4.66 1.63.78.24.12.4.18.46.28.06.1.06.55-.14 1.1Z'
		}
	];
</script>

<svelte:head><title>Account — leaders.ke</title></svelte:head>

<div class="max-w-xl">
	<h1 class="text-xl font-bold text-heading">Account</h1>
	<p class="mt-1 text-sm text-muted">Your details and how leaders.ke reaches you.</p>

	{#if form?.error}
		<div class="mt-4 rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
			{form.error}
		</div>
	{:else if form?.saved}
		<div class="mt-4 rounded-xl bg-primary-soft p-4 text-sm font-medium text-on-primary">Saved.</div>
	{/if}

	<form method="post" action="?/save" class="mt-6 space-y-4" use:enhance>
		<div class="grid gap-3 sm:grid-cols-2">
			<label class="block">
				<span class="text-xs font-medium text-muted">First name</span>
				<input
					type="text"
					name="firstName"
					required
					value={data.firstName}
					class="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
				/>
			</label>
			<label class="block">
				<span class="text-xs font-medium text-muted">Other names</span>
				<input
					type="text"
					name="otherNames"
					required
					value={data.otherNames}
					class="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
				/>
			</label>
		</div>

		<label class="block">
			<span class="text-xs font-medium text-muted">Email</span>
			<span class="mt-1 flex items-stretch overflow-hidden">
				<input
					type="email"
					disabled
					value={data.email}
					class="w-full cursor-not-allowed rounded-l-xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-muted"
				/>
				<a href="/change-email" class="grid place-items-center px-2 py-0.5 bg-surface-3 text-sm text-primary rounded-r-xl">Change</a>
			</span>
		</label>

		<div class="grid gap-3 sm:grid-cols-2">
			<div>
				<PhoneInput bind:value={smsPhone} label="SMS number" />
				<input type="hidden" name="smsPhone" value={smsPhone} />
			</div>
			<div>
				<PhoneInput bind:value={whatsappPhone} label="WhatsApp number" />
				<input type="hidden" name="whatsappPhone" value={whatsappPhone} />
			</div>
		</div>

		<fieldset>
			<legend class="text-xs font-medium text-muted">Notify me by</legend>
			<div class="mt-2 flex flex-wrap gap-2">
				{#each notifyChannels as channel (channel.name)}
					<label
						class="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm font-medium text-muted transition select-none has-checked:border-primary has-checked:bg-primary has-checked:text-on-primary hover:bg-surface-2"
					>
						<input type="checkbox" name={channel.name} checked={channel.checked} class="sr-only" />
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="size-4 shrink-0">
							<path stroke-linecap="round" stroke-linejoin="round" d={channel.icon} />
						</svg>
						{channel.label}
					</label>
				{/each}
			</div>
		</fieldset>

		<div class="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3">
			<a
				href="/change-password"
				class="rounded-xl border border-border bg-surface px-4 py-2 text-center text-sm font-medium text-heading transition hover:border-primary hover:bg-surface-2"
			>
				Change password
			</a>
			<a
				href="/logout"
				data-sveltekit-preload-data="off"
				class="w-full rounded-xl border border-border bg-surface px-4 py-2 text-center text-sm font-medium text-heading transition hover:border-primary hover:bg-surface-2"
			>
				Log out
			</a>
			<button
				type="submit"
				class="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95"
			>
				Save
			</button>
		</div>
	</form>


</div>
