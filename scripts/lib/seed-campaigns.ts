// Seeds/enriches one verified 2027 main campaign per person named in
// src/lib/data/campaigns.json. A campaign is a RUN (person + seat + cycle), not a
// leaders term, so this resolves the PERSON (by their seed email) rather than a
// leaders row — a pure aspirant has no leaders row at all. Runs after 'leaders'/'mcas'
// (needs the person to exist). Idempotent: find-or-create on (person, 2027), then
// stamp the curated title/description/seat and mark it verified (public + ballot-eligible).
import { and, eq, isNull } from 'drizzle-orm';
import { campaigns, positions, users } from '../../src/lib/server/db/schema';
import { user as authUsers } from '../../src/lib/server/db/auth.schema';
import { slugify, type AnyDb } from './names';
import campaignsData from '../../src/lib/data/campaigns.json';

type CampaignRow = {
	leaderName: string;
	leaderTitle: string;
	leaderRegion: string;
	title: string;
	description: string;
};

const CYCLE = 2027;

export async function seedCampaigns(db: AnyDb) {
	let seeded = 0;
	let enriched = 0;
	let missingPerson = 0;
	let missingPosition = 0;

	for (const row of campaignsData as CampaignRow[]) {
		// People seeded by the leaders/mcas phase use this deterministic email.
		const email = `${slugify(row.leaderName)}@seed.leaders.ke`;
		const [auth] = await db.select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.email, email));
		const person = auth ? (await db.select({ id: users.id }).from(users).where(eq(users.authUserId, auth.id)))[0] : undefined;
		if (!person) {
			console.warn(`no person found for ${row.leaderName} (${email}), skipping campaign`);
			missingPerson++;
			continue;
		}

		const [position] = await db
			.select({ id: positions.id })
			.from(positions)
			.where(and(eq(positions.title, row.leaderTitle), eq(positions.region, row.leaderRegion), isNull(positions.deletedAt)));
		if (!position) {
			console.warn(`no ${row.leaderTitle} position for region "${row.leaderRegion}" (${row.leaderName}), skipping campaign`);
			missingPosition++;
			continue;
		}

		const [existing] = await db
			.select({ id: campaigns.id })
			.from(campaigns)
			.where(and(eq(campaigns.subjectUserId, person.id), eq(campaigns.cycleYear, CYCLE), isNull(campaigns.parentCampaignId), isNull(campaigns.deletedAt)));
		if (existing) {
			// The leaders/mcas phase may have created a generic run for an aspirant; stamp
			// the curated title/description/seat and make sure it's verified (public).
			await db
				.update(campaigns)
				.set({ title: row.title, description: row.description, positionId: position.id, verifiedAt: new Date() })
				.where(eq(campaigns.id, existing.id));
			enriched++;
		} else {
			// A current officeholder seeking re-election has no 2027 run yet — create it.
			await db.insert(campaigns).values({
				creatorId: person.id,
				subjectUserId: person.id,
				leaderId: null,
				positionId: position.id,
				cycleYear: CYCLE,
				verifiedAt: new Date(),
				title: row.title,
				description: row.description
			});
			seeded++;
		}
	}

	console.log(`[campaigns] created ${seeded}, enriched ${enriched}, ${missingPerson} missing a person, ${missingPosition} missing a position`);
}
