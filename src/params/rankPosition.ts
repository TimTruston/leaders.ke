import type { ParamMatcher } from '@sveltejs/kit';
import { RANK_POSITIONS } from '$lib/utils/rankPositions';

// /rank/[position]: only the known plural position slugs (presidents, mcas, …).
export const match: ParamMatcher = (param) => RANK_POSITIONS.some((p) => p.slug === param);
