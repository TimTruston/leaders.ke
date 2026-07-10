import type { ParamMatcher } from '@sveltejs/kit';

// Election-cycle segment: exactly four digits (e.g. /governor/nairobi/2027).
// Leader slugs are never purely numeric, so the two can share a URL level.
export const match: ParamMatcher = (param) => /^\d{4}$/.test(param);
