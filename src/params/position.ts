import type { ParamMatcher } from '@sveltejs/kit';
import { POSITION_SLUG_BY_TITLE } from '$lib/utils/seat';

// First-segment whitelist for the public taxonomy (/[position]/[region]/...).
// Keeps the catch-all from shadowing static routes like /features or /pricing.
// Canonical slugs are PLURAL (/governors); the singular forms redirect via the
// positionSingular matcher. Stays in sync with the titles seeded in scripts/seed.ts.
export const POSITION_SLUGS = Object.values(POSITION_SLUG_BY_TITLE);

export const match: ParamMatcher = (param) => POSITION_SLUGS.includes(param);
