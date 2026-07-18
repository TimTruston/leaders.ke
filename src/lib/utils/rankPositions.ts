// The /rank/[position] pages: one plural URL slug per elective position, in
// hierarchy order (national to ward). Shared by the route matcher, the rank
// pages' pills, and the /rank redirect.
export const RANK_POSITIONS = [
	{ slug: 'presidents', title: 'President' },
	{ slug: 'governors', title: 'Governor' },
	{ slug: 'senators', title: 'Senator' },
	{ slug: 'mps', title: 'MP' },
	{ slug: 'women-reps', title: 'Woman Rep' },
	{ slug: 'mcas', title: 'MCA' }
] as const;

export type RankPositionSlug = (typeof RANK_POSITIONS)[number]['slug'];

export const titleForRankSlug = (slug: string) => RANK_POSITIONS.find((p) => p.slug === slug)?.title ?? null;
