// Shared filter/sort for ReviewFilter's controls, over anything shaped like a
// review (public ReviewItem or dashboard ModerationReviewItem both qualify).
export type FilterableReview = {
	rating: number;
	pillarTitle: string | null;
	likes: number;
	createdAt: string;
};

export function filterAndSortReviews<T extends FilterableReview>(
	items: T[],
	opts: { rating: number | ''; pillarTitle: string; sortBy: 'recent' | 'likes'; sortDir: 'asc' | 'desc' }
): T[] {
	const filtered = items.filter(
		(r) =>
			(!opts.rating || r.rating === opts.rating) &&
			(!opts.pillarTitle || r.pillarTitle === opts.pillarTitle)
	);

	const sorted = filtered.toSorted((a, b) => {
		const diff =
			opts.sortBy === 'likes'
				? a.likes - b.likes
				: new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
		return opts.sortDir === 'asc' ? diff : -diff;
	});

	return sorted;
}
