// Wipes every seed-managed table plus all accounts (dev logins, manual signups,
// everything) so a full `bun run db:seed` / `--clear` reseeds from a genuinely
// clean slate. TRUNCATE ... CASCADE on the auth `user` table takes `account`,
// `session`, and the domain `users` row with it via FK cascade — the system/dev-admin
// account (DEV_LOGIN_EMAIL) is recreated fresh by the seed pipeline's first phase.
import { sql } from 'drizzle-orm';
import type { AnyDb } from './names';

const SEED_MANAGED_TABLES = [
	'positions',
	'contacts',
	'leaders',
	'experience',
	'pillars',
	'pillar_templates',
	'campaigns',
	'managers',
	'ambassadors',
	'invites',
	'verifications',
	'profile_claims',
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
	'ballot_simulations',
	'users',
	'user',
	'account',
	'session',
	'verification'
];

export async function resetSeedData(db: AnyDb) {
	const tableList = SEED_MANAGED_TABLES.map((t) => `"${t}"`).join(', ');
	await db.execute(sql.raw(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE;`));
	console.log(`[reset] truncated ${SEED_MANAGED_TABLES.length} tables (all accounts included — fresh slate)`);
}
