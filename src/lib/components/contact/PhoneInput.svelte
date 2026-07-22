<script lang="ts">
	import { page } from '$app/state';
	import { normalizeKenyanPhone } from '$lib/utils/phone';

	let {
		value = $bindable(''),
		field = 'sms',
		label = 'Phone number',
		bg = 'bg-surface',
		verified = false,
		required = false,
		filled = false,
		scope = 'account',
		verifiable = true,
		verifiedValues = []
	}: {
		value?: string;
		field?: string; // sms | whatsapp
		label?: string;
		/** Tailwind bg class for the wrapper (matches the surrounding surface). */
		bg?: string;
		verified?: boolean;
		/** Show a `*` next to the label when this contact is required. */
		required?: boolean;
		/** Mutes the required `*` once this contact is saved. */
		filled?: boolean;
		/** Who the verification attaches to: 'account' (citizen) or 'profile' (leader). */
		scope?: string;
		/** Hides the Verify/✓ affordances entirely. */
		verifiable?: boolean;
		/** Numbers (254… form) this user already verified elsewhere (e.g. their
		 * citizen account) — typing one shows ✓ immediately, preventing a double OTP. */
		verifiedValues?: string[];
	} = $props();
	// Stored numbers are normalized to 254XXXXXXXXX; the field sits after a "+254"
	// prefix, so show just the local part (712345678) rather than "+254 254…".
	const asStored = normalizeKenyanPhone(value);
	if (asStored) value = asStored.slice(3);

	let original = $state(value);

	const normalized = $derived(normalizeKenyanPhone(value));
	const invalid = $derived(value.length > 0 && normalized === null);
	const isVerifiedNow = $derived(
		(verified && value === original) || (!!normalized && verifiedValues.includes(normalized))
	);
	// The verify routes read different param names: /verify/sms?phone= vs /verify/whatsapp?number=.
	// next = the page we're on, so verifying returns here (e.g. mid leader-profile
	// creation on /dashboard/contacts) instead of the default /dashboard/account — but
	// if THIS page was itself reached via its own ?next= (e.g. the onboarding gate sent
	// us to /dashboard/account?next=/onboard/profile...), chase that further destination
	// instead of looping back to this page.
	const verifyHref = $derived(
		`/verify/${field}?${field === 'whatsapp' ? 'number' : 'phone'}=${value}&next=${encodeURIComponent(page.url.searchParams.get('next') ?? page.url.pathname)}&scope=${scope}${page.params.slug ? `&slug=${page.params.slug}` : ''}`
	);
</script>

<label class="block">
	<span class="text-xs font-medium text-ink-secondary">{label}{#if required}<span
				class={filled ? 'text-muted' : 'text-red-500'}> *</span
			>{/if}</span>
	<div
		class="mt-1 flex items-stretch rounded-xl overflow-hidden transition-colors {bg}
		border {invalid ? 'border-red-500/60' : 'border-border'}
		focus-within:border-primary focus:ring-0 focus:ring-ring outline-hidden focus:outline-none"
	>
		<span class="grid select-none place-items-center border-r border-border px-3 text-sm text-ink-secondary">
			+254
		</span>
		<input
			type="tel"
			inputmode="numeric"
			bind:value
			autocomplete="tel"
			placeholder="712 345 678"
			class="w-full bg-transparent px-4 py-2.5 text-ink-primary placeholder:text-muted outline-hidden focus:outline-none focus:ring-0 border-0"
		/>
		{#if invalid}
			<span class="grid place-items-center px-4 py-0.5 text-sm text-red-400 rounded-r-xl text-nowrap" >Invalid</span>
		{:else if verifiable && value && isVerifiedNow}
			<span class="grid place-items-center px-4 py-0.5 text-sm text-primary rounded-r-xl text-nowrap" >✓ Verified</span>
		{:else if verifiable && value}
			<span class="flex items-center gap-2 px-4 py-0.5 text-sm text-primary text-nowrap rounded-r-xl">
				<a href={verifyHref} data-sveltekit-preload-data="off" class="">Verify</a>
				{#if value !== original}
					<span class="" >·</span>
					<button type="button" onclick={() => value = original} class="rounded-r-xl">Reset</button>
				{/if}
			</span>
		{/if}
	</div>
</label>
