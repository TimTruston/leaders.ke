<script module lang="ts">
	// Editor for a provider's entire "Contacts" tab: location, address, map pin, phone,
	// email, website, and social links. Depends on LocationPicker + PhoneInput (outside
	// this folder) in addition to ContactIcon.svelte alongside it.
	//
	// Usage:
	//   import ContactForm, { socialsToLinks, linksToSocials } from './contact/ContactForm.svelte';
	//   let links = $state(socialsToLinks(saved.socials));  // seed from stored { platform: url }
	//   <ContactForm bind:city bind:area bind:road bind:building bind:floor bind:door
	//     bind:lat bind:lng bind:contactPhone bind:contactEmail bind:website bind:links />
	//   // on submit:
	//   payload.socials = { ...linksToSocials(links), website };
	//
	// Pairs with ContactLinks.svelte, which renders the read-only, public-facing version
	// of the same phone/email/socials data.
	//
	// The platform list + handle/URL helpers live in ./socials.ts (no LocationPicker/
	// PhoneInput dependency) so callers that only need the social-links piece, without a
	// location picker, can import from there instead of this file.
	export { type SocialLink, PLATFORMS, stripPrefix, socialsToLinks, linksToSocials } from './socials';
	import { PLATFORMS, looksLikeUrl, stripPrefix, type SocialLink } from './socials';
</script>

<script lang="ts">
	import ContactIcon from './ContactIcon.svelte';
	import LocationPicker from '$lib/components/LocationPicker.svelte';
	import PhoneInput from '$lib/components/PhoneInput.svelte';

	let {
		city = $bindable(''),
		area = $bindable(''),
		road = $bindable(''),
		building = $bindable(''),
		floor = $bindable(''),
		door = $bindable(''),
		lat = $bindable(null),
		lng = $bindable(null),
		contactPhone = $bindable(''),
		contactEmail = $bindable(''),
		website = $bindable(''),
		links = $bindable([]),
		socialLabel = 'Social links'
	}: {
		city?: string;
		area?: string;
		road?: string;
		building?: string;
		floor?: string;
		door?: string;
		lat?: number | null;
		lng?: number | null;
		contactPhone?: string;
		contactEmail?: string;
		website?: string;
		links?: SocialLink[];
		socialLabel?: string;
	} = $props();

	const inputClass =
		'mt-1 w-full rounded-xl border border-hairline bg-surface px-4 py-3 text-ink-primary outline-none focus:border-gold';

	// Per-platform paste validation errors, keyed by platform kind.
	let errors = $state<Record<string, string>>({});

	const labelFor = (k: string) => PLATFORMS.find((p) => p.kind === k)?.label ?? k;
	const prefixFor = (k: string) => PLATFORMS.find((p) => p.kind === k)?.prefix ?? '';
	const placeholderFor = (k: string) => PLATFORMS.find((p) => p.kind === k)?.placeholder ?? 'handle';
	const isActive = (k: string) => links.some((s) => s.kind === k);

	function toggleSocial(k: string) {
		links = isActive(k) ? links.filter((s) => s.kind !== k) : [...links, { kind: k, value: '' }];
	}

	function removeSocial(i: number) {
		const removed = links[i]?.kind;
		links = links.filter((_, idx) => idx !== i);
		if (removed) delete errors[removed];
	}

	function handleSocialInput(e: Event, kind: string, idx: number) {
		const input = e.target as HTMLInputElement;
		// Strip spaces - handles prevent and paste in one place.
		const v = input.value.replace(/\s+/g, '');
		if (v !== input.value) {
			links[idx].value = v;
			input.value = v;
		}

		if (!looksLikeUrl(v)) {
			// Plain handle - clear any previous error.
			delete errors[kind];
			return;
		}
		const stripped = stripPrefix(kind, v);
		if (stripped !== v) {
			// URL matched this platform - use the handle and clear any error.
			links[idx].value = stripped;
			delete errors[kind];
		} else {
			// URL doesn't match this platform - show error and clear the field.
			errors[kind] = `"${v}" is not a ${prefixFor(kind)} URL`;
			links[idx].value = '';
		}
	}
</script>

<!-- Location row: City / Area / Road -->
<div>
	<span class="text-xs font-medium text-ink-secondary">Location</span>
	<div class="mt-1 grid grid-cols-3 gap-2">
		<label class="block">
			<span class="text-xxs text-ink-secondary">City / Town</span>
			<input type="text" bind:value={city} placeholder="Nairobi" class={inputClass} required />
		</label>
		<label class="block">
			<span class="text-xxs text-ink-secondary">Local area</span>
			<input type="text" bind:value={area} placeholder="Westlands" class={inputClass} />
		</label>
		<label class="block">
			<span class="text-xxs text-ink-secondary">Road</span>
			<input type="text" bind:value={road} placeholder="Waiyaki Way" class={inputClass} />
		</label>
	</div>
</div>

<!-- Address row: Building / Floor / Door -->
<div>
	<span class="text-xs font-medium text-ink-secondary">Address</span>
	<div class="mt-1 grid grid-cols-3 gap-2">
		<label class="block">
			<span class="text-xxs text-ink-secondary">Building/Apt</span>
			<input type="text" bind:value={building} placeholder="Delta House" class={inputClass} />
		</label>
		<label class="block">
			<span class="text-xxs text-ink-secondary">Floor #</span>
			<input type="text" bind:value={floor} placeholder="3rd" class={inputClass} />
		</label>
		<label class="block">
			<span class="text-xxs text-ink-secondary">Door</span>
			<input type="text" bind:value={door} placeholder="302" class={inputClass} />
		</label>
	</div>
</div>

<div>
	<span class="text-xs font-medium text-ink-secondary">Pin your location (tap the map)</span>
	<div class="mt-1">
		<LocationPicker {lat} {lng} onpick={(la, ln) => { lat = la; lng = ln; }} />
	</div>
	{#if lat != null && lng != null}
		<p class="mt-1 text-xs text-mpesa">✓ {lat.toFixed(4)}, {lng.toFixed(4)}</p>
	{/if}
</div>

<PhoneInput bind:value={contactPhone} label="Contact phone" />

<label class="block">
	<span class="text-xs font-medium text-ink-secondary">Contact email</span>
	<div class="mt-1 flex items-stretch overflow-hidden rounded-xl border border-hairline bg-surface focus-within:border-gold">
		<span class="grid w-11 select-none place-items-center border-r border-hairline text-base text-ink-secondary">@</span>
		<input type="email" bind:value={contactEmail} placeholder="hello@savannah.ke" class="w-full bg-transparent px-3 py-3 text-ink-primary outline-none" />
	</div>
</label>

<label class="block">
	<span class="text-xs font-medium text-ink-secondary">Website</span>
	<div class="relative mt-1">
		<span class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-secondary"><ContactIcon kind="website" /></span>
		<input type="text" bind:value={website} placeholder="yourbusiness.co.ke" class="w-full rounded-xl border border-hairline bg-surface py-3 pl-11 pr-4 text-ink-primary outline-none focus:border-gold" />
	</div>
</label>

<div>
	<span class="text-xs font-medium text-ink-secondary">{socialLabel}</span>
	<div class="mt-2 flex flex-wrap gap-4">
		{#each PLATFORMS as p (p.kind)}
			<button
				type="button"
				onclick={() => toggleSocial(p.kind)}
				aria-pressed={isActive(p.kind)}
				aria-label={p.label}
				title={p.label}
				class="grid h-9 w-9 place-items-center transition-colors {isActive(p.kind) ? 'text-gold' : 'text-ink-secondary hover:text-ink-primary'}"
			>
				<ContactIcon kind={p.kind} size={24} />
			</button>
		{/each}
	</div>
	{#if links.length > 0}
		<div class="mt-3 flex flex-col gap-2">
			{#each links as link, i (link.kind)}
				<div class="flex items-stretch overflow-hidden rounded-xl border border-hairline bg-surface focus-within:border-gold">
					<span class="grid select-none place-items-center gap-1.5 border-r border-hairline px-2.5 text-ink-secondary" style="grid-auto-flow:column">
						<ContactIcon kind={link.kind} size={14} />
						<span class="text-xs">{prefixFor(link.kind)}</span>
					</span>
					<input
						type="text"
						bind:value={links[i].value}
						aria-label={labelFor(link.kind)}
						placeholder={placeholderFor(link.kind)}
						oninput={(e) => handleSocialInput(e, link.kind, i)}
						class="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm text-ink-primary outline-none placeholder:text-muted"
					/>
					<button type="button" onclick={() => removeSocial(i)} aria-label="Remove {labelFor(link.kind)}" class="grid h-full w-10 shrink-0 place-items-center border-l border-hairline text-ink-secondary transition-colors hover:text-red-400">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M6 6l12 12M18 6 6 18" />
						</svg>
					</button>
				</div>
				{#if errors[link.kind]}
					<p class="mt-1 text-xs text-red-400">{errors[link.kind]}</p>
				{/if}
			{/each}
		</div>
	{/if}
</div>
