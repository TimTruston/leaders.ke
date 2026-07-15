<script lang="ts">
	import { page } from '$app/state';

	// Email counterpart to PhoneInput: an email field with an inline verified badge.
	// Unchanged + verified shows "✓ Verified"; any edit swaps to a Verify link (which
	// carries the typed value to /verify/email) plus a Reset back to the saved value.
	let {
		value = $bindable(''),
		label = 'Email',
		bg = 'bg-surface',
		verified = false,
		required = false,
		filled = false,
		scope = 'account'
	}: {
		value?: string;
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
	} = $props();

	let original = $state(value);

	// next = the page we're on, so verifying returns here (e.g. mid leader-profile
	// creation on /dashboard/contacts) instead of the default /dashboard/account.
	const verifyHref = $derived(
		`/verify/email?email=${encodeURIComponent(value)}&next=${encodeURIComponent(page.url.pathname)}&scope=${scope}${page.params.slug ? `&slug=${page.params.slug}` : ''}`
	);
</script>

<label class="block">
	<span class="text-xs font-medium text-ink-secondary">{label}{#if required}<span
				class={filled ? 'text-muted' : 'text-red-500'}> *</span
			>{/if}</span>
	<div
		class="mt-1 flex items-stretch rounded-xl overflow-hidden transition-colors {bg}
		border border-border focus-within:border-primary focus:ring-0 focus:ring-ring outline-hidden focus:outline-none"
	>
		<input
			type="email"
			bind:value
			autocomplete="email"
			placeholder="example@email.com"
			class="w-full bg-transparent px-4 py-2.5 text-ink-primary placeholder:text-muted outline-hidden focus:outline-none focus:ring-0 border-0"
		/>
		{#if value && verified && value === original}
			<span class="grid place-items-center px-4 py-0.5 text-sm text-primary rounded-r-xl text-nowrap" >✓ Verified</span>
		{:else if value}
			<a href={verifyHref} data-sveltekit-preload-data="off" class="grid place-items-center py-0.5 text-sm text-primary">Verify</a>
			{#if value !== original}
				<span class="grid place-items-center px-1 py-0.5 text-sm text-on-primary" >·</span>
				<button type="button" onclick={() => value = original} class="grid place-items-center pr-3 py-0.5 text-sm text-primary rounded-r-xl">Reset</button>
			{/if}
		{/if}
	</div>
</label>
