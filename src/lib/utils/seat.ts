// Client-safe seat-page URL builder for the public taxonomy
// (/[position]/[region], see src/params/position.ts). Kept out of
// $lib/server/leader so components can link seats without pulling server-only env.
// Canonical position slugs are PLURAL (/governors/mombasa); the singular forms
// 301 to them (src/routes/[position=positionSingular]).
export const POSITION_SLUG_BY_TITLE: Record<string, string> = {
	President: 'presidents',
	'Deputy President': 'deputy-presidents',
	Governor: 'governors',
	Senator: 'senators',
	'Woman Rep': 'women-reps',
	MP: 'mps',
	MCA: 'mcas'
};

/** Singular → canonical plural, for the singular URL routes. Multi-region
 * singulars 301 to the plural directory; Country-wide ones (/president) render
 * the seat hub directly — the singular IS the seat. */
export const SINGULAR_POSITION_SLUGS: Record<string, string> = {
	president: 'presidents',
	'deputy-president': 'deputy-presidents',
	governor: 'governors',
	senator: 'senators',
	'woman-rep': 'women-reps',
	mp: 'mps',
	mca: 'mcas'
};

/** Title → singular slug (the hub URL for Country-wide seats, e.g. /president). */
export const SINGULAR_SLUG_BY_TITLE: Record<string, string> = {
	President: 'president',
	'Deputy President': 'deputy-president',
	Governor: 'governor',
	Senator: 'senator',
	'Woman Rep': 'woman-rep',
	MP: 'mp',
	MCA: 'mca'
};

/** The canonical URL slug for a position title, or null for unknown titles. */
export const positionSlug = (title: string): string | null => POSITION_SLUG_BY_TITLE[title] ?? null;

/** Display plural for a position title (breadcrumbs, directory headings). */
export const PLURAL_TITLE_BY_TITLE: Record<string, string> = {
	President: 'Presidents',
	'Deputy President': 'Deputy Presidents',
	Governor: 'Governors',
	Senator: 'Senators',
	'Woman Rep': 'Women Representatives',
	MP: 'Members of Parliament',
	MCA: 'Members of County Assemblies'
};
export const pluralPositionTitle = (title: string): string => PLURAL_TITLE_BY_TITLE[title] ?? `${title}s`;

const slugify = (input: string) =>
	input
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/['’]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');

/** The seat hub path for a (position, region) pair, or null when the title isn't
 * a known seat. Country-wide seats (region "Kenya") live at the SINGULAR
 * /<position> (e.g. /president — a single seat, not a directory). */
export function seatPath(positionTitle?: string, region?: string): string | null {
	const slug = positionTitle ? POSITION_SLUG_BY_TITLE[positionTitle] : undefined;
	if (!slug) return null;
	if (!region || region === 'Kenya') return `/${SINGULAR_SLUG_BY_TITLE[positionTitle!]}`;
	return `/${slug}/${slugify(region)}`;
}
