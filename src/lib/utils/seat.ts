// Client-safe seat-page URL builder for the public taxonomy
// (/[position]/[region], see src/params/position.ts). Kept out of
// $lib/server/leader so components can link seats without pulling server-only env.
const SLUG_BY_TITLE: Record<string, string> = {
	President: 'president',
	'Deputy President': 'deputy-president',
	Governor: 'governor',
	Senator: 'senator',
	'Woman Rep': 'woman-rep',
	MP: 'mp',
	MCA: 'mca'
};

const slugify = (input: string) =>
	input
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/['’]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');

/** The seat hub path for a (position, region) pair, or null when the title isn't
 * a known seat. Country-wide seats (region "Kenya") live at /<position> alone. */
export function seatPath(positionTitle?: string, region?: string): string | null {
	const slug = positionTitle ? SLUG_BY_TITLE[positionTitle] : undefined;
	if (!slug) return null;
	if (!region || region === 'Kenya') return `/${slug}`;
	return `/${slug}/${slugify(region)}`;
}
