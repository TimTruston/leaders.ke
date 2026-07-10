import type { ParamMatcher } from '@sveltejs/kit';

// First-segment whitelist for the public taxonomy (/[position]/[region]/...).
// Keeps the catch-all from shadowing static routes like /features or /pricing.
// Stays in sync with the titles seeded in scripts/seed.ts.
export const POSITION_SLUGS = [
	'president',
	'deputy-president',
	'governor',
	'senator',
	'woman-rep',
	'mp',
	'mca'
] as const;

export const match: ParamMatcher = (param) => {
	return (POSITION_SLUGS as readonly string[]).includes(param);
};
