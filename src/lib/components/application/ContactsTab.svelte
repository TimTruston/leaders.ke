<script lang="ts">
	import { enhance } from '$app/forms';
	import ContactIcon from '$lib/components/contact/ContactIcon.svelte';
	import { PLATFORMS, stripPrefix, socialsToLinks, type SocialLink } from '$lib/components/contact/socials';
	import PhoneInput from '$lib/components/contact/PhoneInput.svelte';
	import EmailInput from '$lib/components/contact/EmailInput.svelte';

	// Shared across the campaign (/dashboard/[slug]), apply (/dashboard/apply/[id]) and
	// claim (/dashboard/claim/[slug]) route families - each family's +page.server.ts
	// shapes `data` and hosts the actions this form posts to (relative ?/action URLs).
	let { data, form, action = '?/save', embedded = false }: { data: any; form: any; action?: string; embedded?: boolean } = $props();

	let address = $state(data.address);
	let sms = $state(data.sms);
	let whatsapp = $state(data.whatsapp);
	let email = $state(data.email);
	let website = $state(data.website);
	let socialLinks = $state<SocialLink[]>(socialsToLinks(data.socials));
	let socialErrors = $state<Record<string, string>>({});
	let saving = $state(false);

	// Errored fields aren't outlined - the red * next to the label (starClass) and
	// the message under the save button do the flagging.
	const errorClass = () => 'border-border focus:border-primary focus:ring-ring';

	// Required-field `*`s track the LIVE inputs: red while empty, muted the moment
	// a value is typed — saving is never blocked on them (the submit widget's
	// checklist is what gates the application).
	const liveByLabel = $derived<Record<string, string>>({
		'Office / address': address,
		'Phone number': sms,
		'Email address': email
	});
	const starRed = (label: string) => !liveByLabel[label]?.trim();
	const starClass = (label: string) => (starRed(label) ? 'text-red-500' : 'text-muted');

	// Which /verify/* scope the Verify links target: 'profile' writes to the leader
	// profile's contacts; 'claim' (claim family) stages the OTP proof inside the
	// pending claim's evidence instead.
	const verifyScope = $derived(data.verifyScope ?? 'profile');

	const isSocialActive = (kind: string) => socialLinks.some((s) => s.kind === kind);
	function toggleSocial(kind: string) {
		socialLinks = isSocialActive(kind) ? socialLinks.filter((s) => s.kind !== kind) : [...socialLinks, { kind, value: '' }];
	}
	function removeSocial(i: number) {
		const removed = socialLinks[i]?.kind;
		socialLinks = socialLinks.filter((_, idx) => idx !== i);
		if (removed) delete socialErrors[removed];
	}
	function handleSocialInput(e: Event, kind: string, i: number) {
		const input = e.target as HTMLInputElement;
		const v = input.value.replace(/\s+/g, ''); // handles never contain spaces
		if (v !== input.value) input.value = v;

		const looksLikeUrl = /^https?:\/\//i.test(v) || /^(www\.)?[\w-]+\.\w{2,}(\/|$)/i.test(v);
		if (!looksLikeUrl) {
			// The normal case: a plain handle, not a pasted URL — just store what was typed.
			socialLinks[i].value = v;
			delete socialErrors[kind];
			return;
		}
		const stripped = stripPrefix(kind, v);
		if (stripped !== v) {
			socialLinks[i].value = stripped;
			delete socialErrors[kind];
		} else {
			const p = PLATFORMS.find((pl) => pl.kind === kind);
			socialErrors[kind] = `"${v}" is not a ${p?.prefix ?? ''} URL`;
			socialLinks[i].value = '';
		}
	}

</script>

<svelte:head>{#if !embedded}<title>Contacts | leaders.ke</title>{/if}</svelte:head>

<div class="">
	<h2 class="{embedded ? 'text-lg font-semibold' : 'text-xl font-bold'} text-heading">Contacts</h2>
	<p class="mt-1 text-sm text-muted">How we and your citizens can reach you.</p>

	{#if form?.error}
		<div class="mt-4 rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
			{form.error}
		</div>
	{/if}

	<form
		method="post"
		action={action}
		class="mt-6 space-y-5"
		use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				saving = false;
				await update({ reset: false });
			};
		}}
	>
		<input type="hidden" name="socialEntries" value={JSON.stringify(socialLinks)} />

		<label class="block">
			<span class="text-sm font-medium text-heading">Office / address <span class={starClass('Office / address')}>*</span></span>
			<input
				type="text"
				name="address"
				bind:value={address}
				placeholder="Nairobi, Kenya"
				class="mt-1.5 w-full rounded-xl border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:ring-0 focus:outline-none {errorClass()}"
			/>
		</label>

		<div class="grid gap-3 sm:grid-cols-2">
			<div class="rounded-xl ">
				<PhoneInput bind:value={sms} label="Public phone number" scope={verifyScope} verified={data.smsVerified ?? false} verifiedValues={data.ownVerified?.sms ?? []} required filled={!starRed('Phone number')} />
				<input type="hidden" name="sms" value={sms} />
			</div>
			<div>
				<PhoneInput bind:value={whatsapp} label="Whatsapp number" field="whatsapp" scope={verifyScope} verified={data.whatsappVerified ?? false} verifiedValues={data.ownVerified?.whatsapp ?? []} />
				<input type="hidden" name="whatsapp" value={whatsapp} />
			</div>
		</div>

		<EmailInput bind:value={email} verified={data.emailVerified} scope={verifyScope} verifiedValues={data.ownVerified?.email ?? []} required filled={!starRed('Email address')} />
			<input type="hidden" name="email" value={email} />

		<label class="block">
			<span class="text-sm font-medium text-heading">Website</span>
			<div class="relative mt-1.5">
				<span class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted">
					<ContactIcon kind="website" size={18} />
				</span>
				<input
					type="text"
					name="website"
					bind:value={website}
					placeholder="yourcampaign.ke"
					class="w-full rounded-xl border border-border bg-surface py-2.5 pr-4 pl-11 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
				/>
			</div>
		</label>

		<div>
			<span class="text-sm font-medium text-heading">Social links</span>
			<div class="mt-2 flex flex-wrap gap-3">
				{#each PLATFORMS as p (p.kind)}
					<button
						type="button"
						onclick={() => toggleSocial(p.kind)}
						aria-pressed={isSocialActive(p.kind)}
						aria-label={p.label}
						title={p.label}
						class="grid h-10 w-10 place-items-center rounded-xl border transition-colors {isSocialActive(p.kind)
							? 'border-primary text-primary'
							: 'border-border bg-surface text-muted hover:text-heading'}"
					>
						<ContactIcon kind={p.kind} size={18} />
					</button>
				{/each}
			</div>
			{#if socialLinks.length > 0}
				<div class="mt-3 flex flex-col gap-2">
					{#each socialLinks as link, i (link.kind)}
						{@const platform = PLATFORMS.find((p) => p.kind === link.kind)}
						<div class="flex items-stretch overflow-hidden rounded-xl border border-border bg-surface focus-within:border-primary">
							<span class="grid select-none grid-flow-col place-items-center gap-1.5 border-r border-border px-2.5 text-muted">
								<ContactIcon kind={link.kind} size={14} />
								<span class="text-xs">{platform?.prefix ?? ''}</span>
							</span>
							<input
								type="text"
								value={link.value}
								aria-label={platform?.label ?? link.kind}
								placeholder={platform?.placeholder ?? 'handle'}
								oninput={(e) => handleSocialInput(e, link.kind, i)}
								class="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-heading placeholder:text-muted focus:outline-none"
							/>
							<button
								type="button"
								onclick={() => removeSocial(i)}
								aria-label="Remove {platform?.label ?? link.kind}"
								class="grid h-full w-10 shrink-0 place-items-center border-l border-border text-muted transition-colors hover:text-heading"
							>
								✕
							</button>
						</div>
						{#if socialErrors[link.kind]}
							<p class="text-xs text-heading">{socialErrors[link.kind]}</p>
						{/if}
					{/each}
				</div>
			{/if}
		</div>

		<div class="border-t border-border pt-6">
			<button
				type="submit"
				disabled={saving}
				class="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition hover:brightness-95 disabled:opacity-60"
			>
				{saving ? 'Saving…' : 'Save contacts'}
			</button>
		</div>
	</form>

</div>
