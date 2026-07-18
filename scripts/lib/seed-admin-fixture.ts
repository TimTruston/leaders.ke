// Dev-only test fixture: a fully-populated demo leader, "Example Leader" (/example-leader),
// that the platform admin MANAGES — so every profile + dashboard feature (bio, contacts,
// education/professional experience, a multi-seat Track Record, a manifesto with a delivery
// scorecard, web posts + a news mention, citizen reviews both public and flagged, donations,
// a manager team and a follower) can be exercised end-to-end from the admin login.
//
// Design:
// - "Example Leader" is its OWN loginable user and owns the profile. The admin account
//   stays a clean admin; it just gets a `managers` row on the profile, which is what the
//   dashboard role switcher reads ("Managing: Example Leader") — ownership alone never
//   surfaces there.
// - Kept UNVERIFIED on purpose (verifiedAt stays null on every leaders row): the public
//   route gate (`/[leader]/+page.server.ts`) 404s unverified profiles for everyone but a
//   platform admin, and every public listing (leaders grid, seat hubs, /vote ballot,
//   search, quick-search) already filters to verifiedAt IS NOT NULL. So the profile is
//   visible ONLY to a signed-in admin, with zero new columns or query changes.
// - The dummy leader/citizens/manager all get real logins (password DUMMY_PASSWORD, emails
//   logged) so their side of the review/team flows can be tested too.
//
// Fully idempotent: every insert guards on an existing row, so re-running (a partial
// `--admin-fixture` phase or a full reseed) backfills without duplicating.
import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import {
	campaigns,
	contacts,
	donations,
	experience,
	followers,
	leaders,
	managers,
	pillars,
	positions,
	posts,
	reviews,
	tags,
	users
} from '../../src/lib/server/db/schema';
import { user as authUsers, account } from '../../src/lib/server/db/auth.schema';
import { splitName, type AnyDb } from './names';

const LEADER_NAME = 'Example Leader';
const LEADER_SLUG = 'example-leader';
const LEADER_EMAIL = 'example-leader@leaders.ke';
const DUMMY_PASSWORD = 'demo-password'; // dev-only login for the seeded leader/citizens/manager
const BIO =
	'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ' +
	'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure ' +
	'dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.';
const LOREM_LINE =
	'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';

/** Position id for a (title, region) seat, or null if the positions phase hasn't run. */
async function positionId(db: AnyDb, title: string, region: string): Promise<number | null> {
	const [p] = await db
		.select({ id: positions.id })
		.from(positions)
		.where(and(eq(positions.title, title), eq(positions.region, region), isNull(positions.deletedAt)));
	return p?.id ?? null;
}

/** Insert-or-find a leaders row for this person+seat+status (verifiedAt stays null). */
async function ensureLeader(
	db: AnyDb,
	userId: number,
	posId: number,
	status: 'former' | 'current' | 'aspirant',
	startAt: Date,
	endAt: Date | null,
	description: string | null
): Promise<number> {
	const [existing] = await db
		.select({ id: leaders.id })
		.from(leaders)
		.where(and(eq(leaders.userId, userId), eq(leaders.positionId, posId), eq(leaders.status, status), isNull(leaders.deletedAt)));
	if (existing) return existing.id;
	const [row] = await db
		.insert(leaders)
		.values({ userId, positionId: posId, status, startAt, endAt, verifiedAt: null, description })
		.returning({ id: leaders.id });
	return row.id;
}

/** Insert-or-find a real (loginable) dummy domain user; sets a slug when given (the leader). */
async function getOrCreateDummyUser(db: AnyDb, name: string, email: string, slug?: string): Promise<number> {
	const [existingAuth] = await db.select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.email, email));
	if (existingAuth) {
		const [du] = await db.select({ id: users.id }).from(users).where(eq(users.authUserId, existingAuth.id));
		if (du) return du.id;
	}
	const authId = randomUUID();
	await db.insert(authUsers).values({ id: authId, name, email, emailVerified: true });
	await db.insert(account).values({
		id: randomUUID(),
		accountId: authId,
		providerId: 'credential',
		userId: authId,
		password: await hashPassword(DUMMY_PASSWORD)
	});
	const { firstName, otherNames } = splitName(name);
	const [du] = await db
		.insert(users)
		.values({ authUserId: authId, firstName, otherNames, slug: slug ?? null, verified: { email: true, sms: true, whatsapp: false } })
		.returning({ id: users.id });
	return du.id;
}

export async function seedAdminFixture(db: AnyDb) {
	const email = process.env.ADMIN_EMAIL;
	if (!email) {
		console.warn('[admin-fixture] ADMIN_EMAIL not set, skipping');
		return;
	}
	const [adminAuth] = await db.select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.email, email));
	const [admin] = adminAuth ? await db.select({ id: users.id }).from(users).where(eq(users.authUserId, adminAuth.id)) : [];
	if (!admin) {
		console.warn('[admin-fixture] admin account not found (run the system-user phase first), skipping');
		return;
	}

	const govId = await positionId(db, 'Governor', 'Nairobi');
	const senId = await positionId(db, 'Senator', 'Nairobi');
	if (!govId || !senId) {
		console.warn('[admin-fixture] Nairobi Governor/Senator positions missing (run the positions phase first), skipping');
		return;
	}

	// The demo leader is its own account (so it reads as "Example Leader" everywhere,
	// not the admin's name), with a public identity (bio + reserved-ish slug).
	const leaderUserId = await getOrCreateDummyUser(db, LEADER_NAME, LEADER_EMAIL, LEADER_SLUG);
	await db
		.update(users)
		.set({ bio: BIO, address: 'City Hall, Nairobi', socials: { twitter: 'https://twitter.com/leaders_ke' } })
		.where(eq(users.id, leaderUserId));

	// Seats. Held Nairobi Governor and Nairobi Senator in prior regimes; vying for
	// Nairobi Governor again — the aspirant term leads the profile (resolveCurrentTerm).
	await ensureLeader(db, leaderUserId, govId, 'former', new Date('2013-08-27T00:00:00+03:00'), new Date('2017-08-08T00:00:00+03:00'), null);
	await ensureLeader(db, leaderUserId, senId, 'former', new Date('2017-08-08T00:00:00+03:00'), new Date('2022-08-09T00:00:00+03:00'), null);
	const aspirantId = await ensureLeader(db, leaderUserId, govId, 'aspirant', new Date('2027-08-10T00:00:00+03:00'), null, null);

	// Contacts (marked verified so the "Verified" chip renders on the profile).
	for (const c of [
		{ channel: 'email' as const, value: 'example.leader.contact@leaders.ke' },
		{ channel: 'sms' as const, value: '254700000001' }
	]) {
		await db.insert(contacts).values({ userId: leaderUserId, channel: c.channel, value: c.value, verifiedAt: new Date() }).onConflictDoNothing();
	}

	// Education + professional history, hung on the leading (aspirant) term.
	const expRows = [
		{ type: 'education' as const, title: 'Bachelor of Laws (LLB)', institution: 'University of Nairobi', from: '2004-09-01', to: '2008-06-01' },
		{ type: 'education' as const, title: 'Master of Public Policy', institution: 'Strathmore University', from: '2009-09-01', to: '2011-06-01' },
		{ type: 'professional' as const, title: 'Managing Partner', institution: 'Lorem & Ipsum Advocates', from: '2011-07-01', to: '2013-08-01' },
		{ type: 'professional' as const, title: 'Board Chairperson', institution: 'Dolor Sit Foundation', from: '2018-01-01', to: null }
	];
	for (const e of expRows) {
		const [ex] = await db
			.select({ id: experience.id })
			.from(experience)
			.where(
				and(
					eq(experience.leaderId, aspirantId),
					eq(experience.type, e.type),
					eq(experience.title, e.title),
					eq(experience.institution, e.institution)
				)
			);
		if (ex) continue;
		await db.insert(experience).values({
			leaderId: aspirantId,
			type: e.type,
			title: e.title,
			institution: e.institution,
			description: LOREM_LINE,
			startAt: new Date(`${e.from}T00:00:00+03:00`),
			endAt: e.to ? new Date(`${e.to}T00:00:00+03:00`) : null
		});
	}

	// Manifesto: 5 pillars, 4 delivered + 1 in progress, on the aspirant term's main campaign.
	let [campaign] = await db
		.select({ id: campaigns.id })
		.from(campaigns)
		.where(and(eq(campaigns.leaderId, aspirantId), isNull(campaigns.parentCampaignId), isNull(campaigns.deletedAt)));
	if (!campaign) {
		[campaign] = await db
			.insert(campaigns)
			.values({ creatorId: leaderUserId, leaderId: aspirantId, positionId: govId, cycleYear: 2027, title: 'Nairobi Forward', description: BIO })
			.returning({ id: campaigns.id });
	}
	const pillarRows = [
		{ title: 'Affordable Healthcare', status: 'delivered' as const },
		{ title: 'Clean Water for All', status: 'delivered' as const },
		{ title: 'Youth Employment', status: 'delivered' as const },
		{ title: 'Better Roads', status: 'delivered' as const },
		{ title: 'Digital Governance', status: 'in_progress' as const }
	];
	for (const [i, p] of pillarRows.entries()) {
		const [ex] = await db
			.select({ id: pillars.id })
			.from(pillars)
			.where(and(eq(pillars.campaignId, campaign.id), eq(pillars.title, p.title), isNull(pillars.deletedAt)));
		if (ex) continue;
		await db.insert(pillars).values({
			campaignId: campaign.id,
			title: p.title,
			summary: LOREM_LINE,
			deliveryStatus: p.status,
			evidence: p.status === 'delivered' ? LOREM_LINE : null,
			sortOrder: i
		});
	}

	// Web posts on the leading term: the newest drives the profile's "Latest post"
	// pointer, and one is tagged to the leader so the "In the news" block populates.
	const postRows = [
		{ title: 'My plan for Nairobi water', body: BIO, news: false },
		{ title: 'Example Leader tables affordable-housing bill', body: BIO, news: true }
	];
	for (const pr of postRows) {
		let [post] = await db
			.select({ id: posts.id })
			.from(posts)
			.where(and(eq(posts.leaderId, aspirantId), eq(posts.title, pr.title), isNull(posts.deletedAt)));
		if (!post) {
			[post] = await db
				.insert(posts)
				.values({
					creatorId: leaderUserId,
					leaderId: aspirantId,
					campaignId: campaign.id,
					title: pr.title,
					body: pr.body,
					aiSummary: LOREM_LINE,
					medium: 'web',
					approved: true,
					public: true
				})
				.returning({ id: posts.id });
		}
		if (pr.news) {
			const [tag] = await db
				.select({ id: tags.id })
				.from(tags)
				.where(and(eq(tags.postId, post.id), eq(tags.leaderId, aspirantId), isNull(tags.deletedAt)));
			if (!tag) await db.insert(tags).values({ creatorId: leaderUserId, postId: post.id, leaderId: aspirantId });
		}
	}

	// Reviews: one self-review (public), one citizen public review, one flagged/hidden
	// (spam) — so the public review list AND the flagged-count moderation UI have data.
	const janeId = await getOrCreateDummyUser(db, 'Jane Wanjiru', 'jane.citizen@leaders.ke');
	const johnId = await getOrCreateDummyUser(db, 'John Otieno', 'john.citizen@leaders.ke');
	const reviewRows = [
		{ reviewerId: leaderUserId, rating: 5, flagReason: null as 'spam' | null, flagged: false },
		{ reviewerId: janeId, rating: 4, flagReason: null as 'spam' | null, flagged: false },
		{ reviewerId: johnId, rating: 1, flagReason: 'spam' as 'spam' | null, flagged: true }
	];
	for (const r of reviewRows) {
		const [ex] = await db
			.select({ id: reviews.id })
			.from(reviews)
			.where(and(eq(reviews.subjectId, leaderUserId), eq(reviews.userId, r.reviewerId), isNull(reviews.deletedAt)));
		if (ex) continue;
		await db.insert(reviews).values({
			userId: r.reviewerId,
			subjectId: leaderUserId,
			public: true,
			rating: r.rating,
			message: LOREM_LINE,
			flagReason: r.flagReason,
			flaggedAt: r.flagged ? new Date() : null
		});
	}

	// Donations on the leading term (confirmed, for the fundraising ledger).
	const donationRows = [
		{ donorName: 'Jane Wanjiru', phoneNumber: '254700000002', amount: 5000, reference: 'DEMO-DON-1' },
		{ donorName: 'Anonymous', phoneNumber: null, amount: 1500, reference: 'DEMO-DON-2' }
	];
	for (const d of donationRows) {
		const [ex] = await db
			.select({ id: donations.id })
			.from(donations)
			.where(and(eq(donations.campaignId, campaign.id), eq(donations.reference, d.reference), isNull(donations.deletedAt)));
		if (ex) continue;
		await db.insert(donations).values({
			campaignId: campaign.id,
			donorName: d.donorName,
			phoneNumber: d.phoneNumber,
			amount: d.amount,
			status: 'confirmed',
			reference: d.reference
		});
	}

	// Team: the ADMIN manages this profile (so it shows in the admin's role switcher as
	// "Managing: Example Leader"), plus a second manager for the team flow.
	const maryId = await getOrCreateDummyUser(db, 'Mary Kamau', 'mary.manager@leaders.ke');
	for (const m of [
		{ userId: admin.id, title: 'Platform Admin (tester)' },
		{ userId: maryId, title: 'Campaign Manager' }
	]) {
		const [ex] = await db
			.select({ id: managers.id })
			.from(managers)
			.where(and(eq(managers.userId, m.userId), eq(managers.subjectUserId, leaderUserId), isNull(managers.deletedAt)));
		if (ex) continue;
		await db.insert(managers).values({
			userId: m.userId,
			subjectUserId: leaderUserId,
			roles: { admin: true, title: m.title },
			isActive: true,
			verifiedAt: new Date()
		});
	}

	// One follower (the leader follows their own leading term).
	const [existingFollow] = await db
		.select({ id: followers.id })
		.from(followers)
		.where(and(eq(followers.userId, leaderUserId), eq(followers.digest, 'leader'), eq(followers.digestId, aspirantId), isNull(followers.deletedAt)));
	if (!existingFollow) {
		await db
			.insert(followers)
			.values({ userId: leaderUserId, digest: 'leader', digestId: aspirantId, county: 'Nairobi', email: true, sms: false, whatsapp: false });
	}

	console.log(`[admin-fixture] seeded demo leader /${LEADER_SLUG} (admin-managed, unverified) + citizens/manager (login pw: ${DUMMY_PASSWORD})`);
}
