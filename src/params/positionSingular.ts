import type { ParamMatcher } from '@sveltejs/kit';
import { SINGULAR_POSITION_SLUGS } from '$lib/utils/seat';

// Singular position words (/governor/...) — matched only to 301 to the
// canonical plural taxonomy (see src/routes/[position=positionSingular]).
export const match: ParamMatcher = (param) => param in SINGULAR_POSITION_SLUGS;
