// Pure, dependency-free social-link helpers shared by ContactForm.svelte (which
// also needs LocationPicker/PhoneInput) and any lighter-weight consumer that just
// wants the platform list + handle/URL normalisation without pulling those in.

export type SocialLink = { kind: string; value: string };

export const PLATFORMS = [
	{ kind: 'instagram', label: 'Instagram', prefix: 'instagram.com/', placeholder: 'yourhandle' },
	{ kind: 'x',         label: 'X',         prefix: 'x.com/',         placeholder: 'yourhandle' },
	{ kind: 'facebook',  label: 'Facebook',  prefix: 'facebook.com/',  placeholder: 'yourpage' },
	{ kind: 'tiktok',    label: 'TikTok',    prefix: 'tiktok.com/@',   placeholder: 'yourhandle' },
	{ kind: 'linkedin',  label: 'LinkedIn',  prefix: 'linkedin.com/in/', placeholder: 'yourprofile' }
] as const;

/** True for strings that look like a URL (with or without protocol). */
export function looksLikeUrl(v: string): boolean {
	return /^https?:\/\//i.test(v) || /^(www\.)?[\w-]+\.\w{2,}(\/|$)/i.test(v);
}

/**
 * Strip the canonical prefix so the field shows just the handle.
 * Normalises protocol-less inputs (e.g. "facebook.com/handle") before matching.
 * Returns the original string when it doesn't match, so callers can flag it.
 */
export function stripPrefix(kind: string, fullUrl: string): string {
	const p = PLATFORMS.find((pl) => pl.kind === kind);
	if (!p) return fullUrl;
	const normalised = /^https?:\/\//i.test(fullUrl) ? fullUrl : `https://${fullUrl}`;
	const variants = [
		`https://${p.prefix}`,
		`https://www.${p.prefix}`,
		`http://${p.prefix}`,
		`http://www.${p.prefix}`
	];
	for (const v of variants) {
		if (normalised.toLowerCase().startsWith(v.toLowerCase())) return normalised.slice(v.length);
	}
	return fullUrl;
}

/** Seed `links` from a stored `{ platform: handleOrUrl }` record (URLs reduced to handles). */
export function socialsToLinks(socials: Record<string, string>, exclude: string[] = ['website']): SocialLink[] {
	return Object.entries(socials)
		.filter(([k]) => !exclude.includes(k))
		.map(([kind, value]) => ({ kind, value: stripPrefix(kind, value) }));
}

/** Serialize `links` back to a `{ platform: handle }` record, dropping empties. */
export function linksToSocials(links: SocialLink[]): Record<string, string> {
	const out: Record<string, string> = {};
	for (const l of links) if (l.value.trim()) out[l.kind] = l.value.trim();
	return out;
}
