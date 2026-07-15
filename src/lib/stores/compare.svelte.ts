// Cross-card selection for LeaderCard's [<>] compare affordance: the first card
// clicked becomes A (shared app-wide, so it survives filtering/paging the list);
// clicking B on any other card navigates to /compare?a=<A>&b=<B> and clears this.
export const compareSelection = $state<{ path: string | null; name: string | null }>({
	path: null,
	name: null
});

export function clearCompareSelection() {
	compareSelection.path = null;
	compareSelection.name = null;
}
