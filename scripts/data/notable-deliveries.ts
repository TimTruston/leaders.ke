// Hand-curated Delivery-tab starter content for specific notable, already-seeded
// profiles — mirrors scripts/data/notable-knowledge.ts's pattern. Distinct from
// manifesto pillars (src/lib/data/pillars.json): a pillar is a forward-looking
// promise for a RUN; these are concrete things already delivered under a HELD
// term, retrospective and never "promised." Keyed by `users.slug`; resolves to
// whichever of the person's CURRENT leaders terms matches `positionTitle` (case
// there's more than one). seedNotableDeliveries (scripts/lib/seed-notable-deliveries.ts)
// pins every item here (capped at 5 per person, same as the dashboard's own
// togglePin action) so they surface on the public profile immediately.
export type NotableDelivery = { title: string; description: string };

export const NOTABLE_DELIVERIES: Record<string, { positionTitle: string; items: NotableDelivery[] }> = {
	'edwin-sifuna': {
		positionTitle: 'Senator',
		items: [
			{
				title: 'Sponsored the Office of the County Printer Bill, 2022',
				description: 'Senate Bill No. 10 of 2022 — opened up transparent, independent county government procurement, cutting a layer of red tape county suppliers and small businesses face.'
			},
			{
				title: 'Sponsored the Sports (Amendment) Bill, 2023/2024',
				description: 'Senate Bill No. 33 — part of his legislative push for real facilities, incentives and rewards for Kenyan sportspeople and artists.'
			},
			{
				title: 'County spending oversight on the Public Accounts Committee',
				description: "Serves on the Senate's County Public Accounts Committee, scrutinizing county spending and borrowing on the floor and in committee since 2022."
			},
			{
				title: "Represented Kenya's doctors in the 2017 100-day strike",
				description: 'As a practising advocate, part of the legal team that negotiated an end to the 2017 doctors’ strike, and has continued pushing for better-resourced public health facilities through his Senate oversight role.'
			},
			{
				title: 'Led the opposition side of the 2023 National Dialogue Committee talks',
				description: 'Picked in May 2023 to lead the opposition side of the Azimio-Kenya Kwanza bipartisan talks that formed NADCO, tasked with resolving the country’s key contentious political issues.'
			}
		]
	}
};
