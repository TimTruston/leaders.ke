// Kenya's electoral geography, sourced from src/lib/data/regions.json (a nested
// county -> constituency -> ward tree derived from the IEBC "Registered Voters
// per County Assembly Ward, 2022 General Election" register). Positions are
// derived entirely from this tree — there's no separate positions data file.
// Used by the positions seed phase and the public seat/hub pages.
import regionsData from './regions.json';

type WardIn = { name: string; description: string; voterCount: number };
type ConstituencyIn = { code: string; name: string; description: string; wards: WardIn[] };
type CountyIn = { code: string; name: string; description: string; constituencies: ConstituencyIn[] };

export type Ward = {
	name: string;
	description: string;
	// Unique seat label for the MCA position: ward names repeat across Kenya
	// (many "Township" wards), so duplicates get "(Constituency)" appended.
	seatName: string;
	voters: number;
};

export type Constituency = {
	code: string;
	name: string;
	description: string;
	seatName: string; // unique MP seat label, "(County)"-qualified when duplicated
	voters: number; // sum of ward voterCounts
	wards: Ward[];
};

export type County = {
	code: string;
	name: string;
	description: string;
	voters: number; // sum of constituency voters
	constituencies: Constituency[];
};

function build(): County[] {
	const regions = regionsData as CountyIn[];

	// Count duplicate names nationwide to compute unique seat labels.
	const wardNameCounts = new Map<string, number>();
	const constNameCounts = new Map<string, number>();
	for (const county of regions) {
		for (const constituency of county.constituencies) {
			constNameCounts.set(constituency.name, (constNameCounts.get(constituency.name) ?? 0) + 1);
			for (const ward of constituency.wards) {
				wardNameCounts.set(ward.name, (wardNameCounts.get(ward.name) ?? 0) + 1);
			}
		}
	}

	return regions.map((county): County => {
		const constituencies = county.constituencies.map((constituency): Constituency => {
			const wards = constituency.wards.map(
				(ward): Ward => ({
					name: ward.name,
					description: ward.description,
					seatName:
						(wardNameCounts.get(ward.name) ?? 0) > 1 ? `${ward.name} (${constituency.name})` : ward.name,
					voters: ward.voterCount
				})
			);
			return {
				code: constituency.code,
				name: constituency.name,
				description: constituency.description,
				seatName:
					(constNameCounts.get(constituency.name) ?? 0) > 1
						? `${constituency.name} (${county.name})`
						: constituency.name,
				voters: wards.reduce((sum, w) => sum + w.voters, 0),
				wards
			};
		});
		return {
			code: county.code,
			name: county.name,
			description: county.description,
			voters: constituencies.reduce((sum, c) => sum + c.voters, 0),
			constituencies
		};
	});
}

export const counties: County[] = build();

/** kebab-case, apostrophes stripped: mirrors leader.ts's slugify. */
export function geoSlug(name: string): string {
	return name
		.toLowerCase()
		.replace(/['’]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');
}

export function findCountyBySlug(slug: string): County | undefined {
	return counties.find((c) => geoSlug(c.name) === slug);
}

export function findConstituencyBySlug(slug: string): Constituency | undefined {
	for (const county of counties) {
		const hit = county.constituencies.find((c) => geoSlug(c.seatName) === slug);
		if (hit) return hit;
	}
	return undefined;
}

export function findWardBySlug(slug: string): Ward | undefined {
	for (const county of counties) {
		for (const constituency of county.constituencies) {
			const hit = constituency.wards.find((w) => geoSlug(w.seatName) === slug);
			if (hit) return hit;
		}
	}
	return undefined;
}
