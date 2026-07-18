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

// Near-miss spellings that 301 to the canonical plural slug (see rank/[alias]):
// each position's singular, plus the woman-rep spelling variants.
export const RANK_SLUG_ALIASES: Record<string, RankPositionSlug> = {
	president: 'presidents',
	governor: 'governors',
	senator: 'senators',
	mp: 'mps',
	mca: 'mcas',
	'woman-rep': 'women-reps',
	'woman-reps': 'women-reps',
	'women-rep': 'women-reps',
	'woman-representative': 'women-reps',
	'women-representative': 'women-reps',
	'woman-representatives': 'women-reps',
	'women-representatives': 'women-reps'
};
