// Wipes every seed-managed table so a full `bun run db:seed` reseeds from a
// clean slate. Deliberately leaves the domain `users` table and better-auth's
// own tables (user/account/session/verification) untouched — login identities
// survive a reseed; seedPeople reattaches a fresh `leaders` row to the
// existing domain user instead of recreating the account.
import { sql } from 'drizzle-orm';
import type { AnyDb } from './names';

const SEED_MANAGED_TABLES = [
	'positions',
	'contacts',
	'leaders',
	'experience',
	'pillars',
	'campaigns',
	'managers',
	'ambassadors',
	'events',
	'posts',
	'featured',
	'banned',
	'tags',
	'issues',
	'comments',
	'followers',
	'files',
	'parties',
	'party_memberships',
	'alliances',
	'alliance_memberships',
	'subscriptions',
	'pricing',
	'payments',
	'wallets',
	'credit_transactions',
	'otps',
	'devices',
	'conversations',
	'messages',
	'reviews',
	'pledges',
	'donations',
	'ballot_simulations'
];

export async function resetSeedData(db: AnyDb) {
	const tableList = SEED_MANAGED_TABLES.map((t) => `"${t}"`).join(', ');
	await db.execute(sql.raw(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE;`));
	console.log(`[reset] truncated ${SEED_MANAGED_TABLES.length} tables (users/auth accounts kept)`);
}
