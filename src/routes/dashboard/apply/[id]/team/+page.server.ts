// The apply family reuses the campaign family's server logic verbatim —
// getRouteLeaderContext resolves the [id] param (the application's pre-minted
// UUID) instead of a campaign slug. See src/routes/dashboard/[slug]/team.
export { load, actions } from '../../../[slug]/team/+page.server';
