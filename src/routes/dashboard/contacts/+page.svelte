<script lang="ts">
	import { getContext } from 'svelte';
	import { enhance } from '$app/forms';
	import ContactIcon from '$lib/components/contact/ContactIcon.svelte';
	import { PLATFORMS, stripPrefix, socialsToLinks, type SocialLink } from '$lib/components/contact/socials';
	import type { PageProps } from './$types';
	import PhoneInput from '$lib/components/contact/PhoneInput.svelte';

	let { data, form }: PageProps = $props();

	const markSaved = getContext<() => void>('markSaved');

	let address = $state(data.address);
	let sms = $state(data.sms);
	let whatsapp = $state(data.whatsapp);
	let email = $state(data.email);
	let website = $state(data.website);
	let socialLinks = $state<SocialLink[]>(socialsToLinks(data.socials));
	let socialErrors = $state<Record<string, string>>({});

	let formEl: HTMLFormElement;
	let saveTimer: ReturnType<typeof setTimeout>;
	function scheduleSave() {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => formEl?.requestSubmit(), 1000);
	}

	const isSocialActive = (kind: string) => socialLinks.some((s) => s.kind === kind);
	function toggleSocial(kind: string) {
		socialLinks = isSocialActive(kind) ? socialLinks.filter((s) => s.kind !== kind) : [...socialLinks, { kind, value: '' }];
		scheduleSave();
	}
	function removeSocial(i: number) {
		const removed = socialLinks[i]?.kind;
		socialLinks = socialLinks.filter((_, idx) => idx !== i);
		if (removed) delete socialErrors[removed];
		scheduleSave();
	}
	function handleSocialInput(e: Event, kind: string, i: number) {
		const input = e.target as HTMLInputElement;
		const v = input.value.replace(/\s+/g, ''); // handles never contain spaces
		if (v !== input.value) {
			socialLinks[i].value = v;
			input.value = v;
		}
		const looksLikeUrl = /^https?:\/\//i.test(v) || /^(www\.)?[\w-]+\.\w{2,}(\/|$)/i.test(v);
		if (!looksLikeUrl) {
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

<svelte:head><title>Contacts | leaders.ke</title></svelte:head>

<div class="">
	<h1 class="text-xl font-bold text-heading">Contacts</h1>
	<p class="mt-1 text-sm text-muted">How we and your citizens can reach you.</p>

	{#if form?.error}
		<div class="mt-4 rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
			{form.error}
		</div>
	{/if}

	<form
		bind:this={formEl}
		method="post"
		action="?/save"
		class="mt-6 space-y-5"
		oninput={scheduleSave}
		onchange={scheduleSave}
		use:enhance={() => {
			return async ({ result, update }) => {
				if (result.type === 'success') markSaved();
				await update({ reset: false });
			};
		}}
	>
		<input type="hidden" name="socialEntries" value={JSON.stringify(socialLinks)} />

		<label class="block">
			<span class="text-sm font-medium text-heading">Office / address</span>
			<input
				type="text"
				name="address"
				bind:value={address}
				placeholder="Nairobi, Kenya"
				class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
			/>
		</label>

		<label class="block">
			<span class="text-xs font-medium text-muted">Email</span>
			<span class="mt-1 flex items-stretch overflow-hidden">
				<input
					type="email"
					disabled
					value={email}
					placeholder="you@example.com"
					class="w-full cursor-not-allowed rounded-l-xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-muted"
				/>
				<a href="/change-email" class="grid place-items-center px-2 py-0.5 bg-surface-3 text-sm text-primary rounded-r-xl">Change</a>
			</span>
		</label>

		<div class="grid gap-3 sm:grid-cols-2">
			<div>
				<PhoneInput bind:value={sms} label="SMS number" />
				<input type="hidden" name="sms number" value={sms} />
			</div>
			<div>
				<PhoneInput bind:value={whatsapp} label="WhatsApp number" />
				<input type="hidden" name="whatsapp number" value={whatsapp} />
			</div>
		</div>

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
					class="w-full rounded-xl border border-border bg-surface py-2.5 pr-4 pl-11 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
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
							? 'border-primary bg-primary-soft text-on-primary'
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
	</form>
</div>
