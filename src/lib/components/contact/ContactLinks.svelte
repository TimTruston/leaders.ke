<script lang="ts">
	// Read-only, public-facing row of contact/social icon links. Copy-drop footprint:
	// this file + ContactIcon.svelte.
	//
	// Usage:
	//   <ContactLinks phone={page.contactPhone} email={page.contactEmail} socials={page.socials} />
	//   <ContactLinks socials={page.socials} share shareTitle={page.name} /> <!-- adds a Share button -->
	//
	// Pairs with ContactForm.svelte, which is the editable counterpart for the same
	// `socials` record (a provider's admin/settings screen).
	import ContactIcon from './ContactIcon.svelte';

	type Kind = 'whatsapp' | 'email' | 'instagram' | 'x' | 'facebook' | 'tiktok' | 'linkedin' | 'website';
	type Link = { href: string; label: string; kind: Kind; external: boolean };

	let {
		phone = null,
		email = null,
		socials = {},
		share = false,
		shareTitle = ''
	}: {
		phone?: string | null;
		email?: string | null;
		socials?: Record<string, string>;
		share?: boolean;
		shareTitle?: string;
	} = $props();

	const KNOWN = new Set<Kind>(['instagram', 'x', 'facebook', 'tiktok', 'linkedin', 'website']);
	// leaders.json/dashboard data sometimes says "twitter" instead of X's current "x" key.
	const ALIASES: Record<string, Kind> = { twitter: 'x' };

	const links = $derived.by(() => {
		const out: Link[] = [];
		if (phone) out.push({ href: `https://wa.me/${phone}`, label: 'WhatsApp', kind: 'whatsapp', external: true });
		if (email) out.push({ href: `mailto:${email}`, label: 'Email', kind: 'email', external: false });
		for (const [key, url] of Object.entries(socials)) {
			if (!url) continue;
			const kind = ALIASES[key] ?? (KNOWN.has(key as Kind) ? (key as Kind) : 'website');
			out.push({ href: url, label: key[0].toUpperCase() + key.slice(1), kind, external: true });
		}
		return out;
	});
</script>

{#if links.length > 0 || share}
	<div class="flex flex-wrap gap-3">
		{#each links as link (link.href)}
			<a
				href={link.href}
				target={link.external ? '_blank' : undefined}
				rel={link.external ? 'noreferrer' : undefined}
				aria-label={link.label}
				title={link.label}
				class="grid h-11 w-11 place-items-center rounded-xl border border-border bg-surface text-muted transition-colors hover:border-primary/50 hover:text-primary"
			>
				<ContactIcon kind={link.kind} size={20} />
			</a>
		{/each}
		{#if share}
			<ContactIcon
				kind="share"
				title={shareTitle}
				label="Share"
				class="grid h-11 w-11 place-items-center rounded-xl border border-border bg-surface text-muted transition-colors hover:border-primary/50 hover:text-primary"
			/>
		{/if}
	</div>
{/if}
