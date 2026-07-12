<script lang="ts">
	import CheckIcon from '../svgs/CheckIcon.svelte';
	import EmailIcon from '../svgs/EmailIcon.svelte';
	import FacebookIcon from '../svgs/FacebookIcon.svelte';
	import GlobeIcon from '../svgs/GlobeIcon.svelte';
	import InstagramIcon from '../svgs/InstagramIcon.svelte';
	import LinkedinIcon from '../svgs/LinkedinIcon.svelte';
	import ShareIcon from '../svgs/ShareIcon.svelte';
	import TiktokIcon from '../svgs/TiktokIcon.svelte';
	import WhatsappIcon from '../svgs/WhatsappIcon.svelte';
	import XIcon from '../svgs/XIcon.svelte';

	let {
		kind,
		size = 18,
		class: className = '',
		// kind="share" only: native share sheet where available, else copy-to-clipboard.
		url = '',
		title = '',
		text = '',
		label = 'Share'
	}: {
		kind: string;
		size?: number;
		class?: string;
		url?: string;
		title?: string;
		text?: string;
		label?: string;
	} = $props();

	let copied = $state(false);

	async function share() {
		const shareUrl = url || (typeof location !== 'undefined' ? location.href : '');
		if (typeof navigator !== 'undefined' && navigator.share) {
			try {
				await navigator.share({ title: title || document.title, url: shareUrl });
			} catch {
				/* user cancelled - ignore */
			}
			return;
		}
		// Fallback: copy the link and flash a confirmation.
		try {
			await navigator.clipboard.writeText(shareUrl);
			copied = true;
			setTimeout(() => (copied = false), 1800);
		} catch {
			/* clipboard blocked - nothing we can do */
		}
	}
</script>

{#if kind === 'share'}
	<!-- Self-contained share button (native share sheet, or copy-link fallback). -->
	<button type="button" onclick={share} aria-label={label} title={copied ? 'Link copied' : label} class={className}>
		{#if text}
			{copied ? 'Link copied!' : text}
		{:else if copied}
			<CheckIcon />
		{:else}
			<ShareIcon />
		{/if}
	</button>
{:else if kind === 'whatsapp'}
	<!-- WhatsApp brand green, regardless of the surrounding text colour. -->
	<WhatsappIcon {size} class="{className} text-[#25D366]" />
{:else if kind === 'email'}
	<EmailIcon {size} class={className} />
{:else if kind === 'instagram'}
	<InstagramIcon {size} class={className} />
{:else if kind === 'x'}
	<XIcon {size} class={className} />
{:else if kind === 'facebook'}
	<FacebookIcon {size} class={className} />
{:else if kind === 'tiktok'}
	<TiktokIcon {size} class={className} />
{:else if kind === 'linkedin'}
	<LinkedinIcon {size} class={className} />
{:else}
	<GlobeIcon {size} class={className} />
{/if}
