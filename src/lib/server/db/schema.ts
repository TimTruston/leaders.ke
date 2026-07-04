import { pgTable, serial, varchar, text, boolean, integer, bigint, timestamp, jsonb, customType, pgEnum, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user } from './auth.schema'; // better-auth owns login; users below is the 1:1 domain profile

export const vector = customType<{ data: number[] }>({
  dataType: () => 'vector(1536)', // Optimizing for OpenAI embeddings length
});

// Pricing band for a position. Groups don't follow boundary: MP is constituency-level but priced with 'regional'.
// national = President/VP; regional = Governor/Senator/MP/Women Rep; ward = MCA
// MP is constituency-level but priced with county group.
export const priceBandEnum = pgEnum('price_band', ['national', 'regional', 'ward']);

// 1. POSITION (Elective & Nominated Leadership Positions)
export const positions = pgTable('positions', {
  id: serial('id').primaryKey(),
  region: varchar('region', { length: 100 }).notNull(), // e.g., 'Kiambu', 'Westlands'
  boundary: varchar('boundary', { length: 50 }).notNull(), // 'Country' | 'County' | 'Constituencies' | 'Ward'
  title: varchar('title', { length: 100 }).notNull(), // 'President', 'MP', 'MCA'
  band: priceBandEnum('band').notNull(), // drives subscription pricing lookup
  isElected: boolean('is_elected').default(true).notNull(), // false means nominated
  currentLeaderId: integer('current_leader_id'), // Self-reference resolved in relations block
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// 2. USERS (Domain profile, bridged 1:1 to better-auth's `user` via authUserId.
// better-auth owns email/password/OAuth/sessions; phones live in `contacts`.)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  authUserId: text('auth_user_id').references(() => user.id, { onDelete: 'cascade' }).notNull().unique(),
  firstName: varchar('first_name', { length: 50 }).notNull(),
  lastName: varchar('last_name', { length: 50 }).notNull(),
  bio: text('bio'),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// 2.1 CONTACTS (per-channel reachable addresses; each verified independently via the verifications OTP table)
export const contactChannelEnum = pgEnum('contact_channel', ['sms', 'whatsapp', 'email']);

export const contacts = pgTable('contacts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  channel: contactChannelEnum('channel').notNull(),
  value: varchar('value', { length: 100 }).notNull(), // phone number or email address
  isPrimary: boolean('is_primary').default(false).notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }), // set once OTP succeeds
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  // One live owner per (channel, value): the same phone/email can't attach to two accounts (anti-farming)
  uniqueIndex('one_value_per_channel').on(t.channel, t.value).where(sql`${t.deletedAt} is null`),
  index('contacts_user_idx').on(t.userId),
]);

// 3. LEADERS (Public profiles connected to Users and positions. Tracks the service history of leaderships)
export const leaders = pgTable('leaders', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  positionId: integer('position_id').references(() => positions.id).notNull(),
  manifestoId: integer('manifesto_id'),
  faq: jsonb('faq').default([]),
  contacts: jsonb('contacts').default({}),
  status: varchar('status', { length: 30 }).default('aspirant').notNull(), // 'aspirant' | 'incumbent' | 'former'
  verifiedAt: timestamp('verified_at', { withTimezone: true }), 
  startAt: timestamp('start_at', { withTimezone: true }).notNull(), // aspirant candidates have a future start date
  endAt: timestamp('end_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  // At most one live 'incumbent' leader per position (partial unique index)
  uniqueIndex('one_incumbent_per_position')
    .on(t.positionId)
    .where(sql`${t.status} = 'incumbent' and ${t.deletedAt} is null`),
]);

// 4. MANIFESTOS & PILLARS (Versioned policy storage)
export const manifestos = pgTable('manifestos', {
  id: serial('id').primaryKey(),
  leaderId: integer('leader_id').references(() => leaders.id, { onDelete: 'cascade' }).notNull(),
  version: integer('version').default(1).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true })
});

export const pillars = pgTable('pillars', {
  id: serial('id').primaryKey(),
  manifestoId: integer('manifesto_id').references(() => manifestos.id, { onDelete: 'cascade' }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  summary: text('summary').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// 5. CAMPAIGNS (Nested Campaign Architectures)
export const campaigns = pgTable('campaigns', {
  id: serial('id').primaryKey(),
  creatorId: integer('creator_id').references(() => users.id).notNull(),
  leaderId: integer('leader_id').references(() => leaders.id, { onDelete: 'cascade' }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description').notNull(), // Rich text payload
  faq: jsonb('faq').default([]),
  parentCampaignId: integer('parent_campaign_id').references((): any => campaigns.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  // Exactly one live MAIN campaign per leader; sub-campaigns (parentCampaignId set) are unrestricted
  uniqueIndex('one_main_campaign_per_leader')
    .on(t.leaderId)
    .where(sql`${t.parentCampaignId} is null and ${t.deletedAt} is null`),
]);

// 6. MANAGEMENT & AMBASSADORS (JSONB Configured Access Controls)
export const managers = pgTable('managers', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(), // Soft delete handles detachment
  leaderId: integer('leader_id').references(() => leaders.id, { onDelete: 'cascade' }).notNull(),
  campaignId: integer('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }),
  roles: jsonb('roles').default({}).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const ambassadors = pgTable('ambassadors', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  leaderId: integer('leader_id').references(() => leaders.id, { onDelete: 'cascade' }).notNull(),
  managerId: integer('manager_id').references(() => managers.id),
  campaignId: integer('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }),
  roles: jsonb('roles').default({}).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// 7. EVENTS
export const events = pgTable('events', {
  id: serial('id').primaryKey(),
  creatorId: integer('creator_id').references(() => users.id).notNull(),
  campaignId: integer('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  agenda: text('agenda').notNull(),
  venue: varchar('venue', { length: 255 }).notNull(),
  startAt: timestamp('start_at', { withTimezone: true }).notNull(),
  endAt: timestamp('end_at', { withTimezone: true }).notNull(),
  attendants: jsonb('attendants').default(['public']).notNull(), // 'public' | 'ambassadors' | 'managers' | 'leaders'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// 8. POSTS & ENGAGEMENT
export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  creatorId: integer('creator_id').references(() => users.id), // system-aggregated posts can have a null creatorId
  leaderId: integer('leader_id').references(() => leaders.id, { onDelete: 'cascade' }),
  campaignId: integer('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body').notNull(),
  aiSummary: text('ai_summary'),
  manualSummary: text('manual_summary'),
  medium: varchar('medium', { length: 50 }).notNull(), // 'web' | 'sms' | 'whatsapp'
  approved: boolean('approved').default(false).notNull(),
  public: boolean('public').default(false).notNull(),
  votes: integer('votes').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// 8.1 FEATURED
export const featured = pgTable('featured', {
  id: serial('id').primaryKey(),
  postId: integer('post_id').references(() => posts.id, { onDelete: 'cascade' }).notNull(),
  summary: varchar('summary', { length: 255 }).notNull(),
  price: integer('price').default(0).notNull(), // how much they paid to feature the post
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// 8.1 BANNED
export const banned = pgTable('banned', {
  id: serial('id').primaryKey(),
  postId: integer('post_id').references(() => posts.id, { onDelete: 'cascade' }).notNull(),
  reason: varchar('reason', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// 8.3 TAGS
export const tags = pgTable('tags', {
  id: serial('id').primaryKey(),
  creatorId: integer('creator_id').references(() => users.id, { onDelete: 'cascade' }), // nullable if the tag is system-generated
  postId: integer('post_id').references(() => posts.id, { onDelete: 'cascade' }).notNull(),
  leaderId: integer('leader_id').references(() => leaders.id, { onDelete: 'cascade' }).notNull(), // who got tagged in the post
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// 9. ISSUES (Civic Feedback Engine)
export const issues = pgTable('issues', {
  id: serial('id').primaryKey(),
  creatorId: integer('creator_id').references(() => users.id).notNull(),
  positionId: integer('position_id').references(() => positions.id).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description').notNull(),
  votes: integer('votes').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// Defines the role/actor type enum for strict type checking at the application layer
export const commentCreatorTypeEnum = pgEnum('comment_creator_type', [
  'citizen', 
  'leaders', 
  'manager', 
  'ambassador'
]);

// 10. COMMENTS
export const comments = pgTable('comments', {
  id: serial('id').primaryKey(),  
  // 1. Unified Creator Pointer (Every actor is structurally a User first)
  creatorId: integer('creator_id').references(() => users.id, { onDelete: 'cascade' }), // creator
  // 2. Discriminator to instantly know the context/role used to author the comment
  creatorType: commentCreatorTypeEnum('creator_type').notNull(), // specifies which type of actor created the comment
  // Target mappings
  postId: integer('post_id').references(() => posts.id, { onDelete: 'cascade' }),
  issueId: integer('issue_id').references(() => issues.id, { onDelete: 'cascade' }),
  parentCommentId: integer('parent_comment_id').references((): any => comments.id, { onDelete: 'cascade' }),
  // Content & Metadata
  message: varchar('message', { length: 255 }).notNull(),
  votes: integer('votes').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// What a follower subscribes to. digestId points at that row's id (null for platform-wide).
export const digestEnum = pgEnum('digest', ['platform', 'position', 'leader', 'campaign']);

// 11. FOLLOWERS (Many-to-Many Relationship between Users and Campaigns or Leaders)
export const followers = pgTable('followers', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  digest: digestEnum('digest').notNull(),
  digestId: integer('digest_id'), // polymorphic: positions/leaders/campaigns id; null for platform-wide follow
  email: boolean('email').default(false).notNull(),
  sms: boolean('sms').default(false).notNull(),
  whatsapp: boolean('whatsapp').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  // One live follow per (user, target). coalesce(digestId, 0) makes platform-wide (null) dedupe too,
  // since NULL != NULL in a plain unique index would otherwise allow duplicate platform follows.
  uniqueIndex('one_follow_per_target')
    .on(t.userId, t.digest, sql`coalesce(${t.digestId}, 0)`)
    .where(sql`${t.deletedAt} is null`),
]);

// 12. FILES
export const files = pgTable('files', {
  id: serial('id').primaryKey(),
  creatorId: integer('creator_id').references(() => users.id).notNull(),
  // A file is scoped to a campaign OR a leader profile (media unrelated to any campaign); at least one must be set
  campaignId: integer('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }),
  leaderId: integer('leader_id').references(() => leaders.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  mimeType: varchar('mime_type', { length: 50 }).notNull(), // 'image/png', 'audio/mp3'
  sizeBytes: bigint('size_bytes', { mode: 'number' }).default(0).notNull(), // for per-leader/campaign storage-quota sums
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('files_leader_idx').on(t.leaderId),
  index('files_campaign_idx').on(t.campaignId),
]);

// 12. PARTIES (Political Parties)
export const parties = pgTable('parties', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description').notNull(),
  logoUrl: text('logo_url').notNull(),
  verified: boolean('verified').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// 13. PARTY_MEMBERSHIPS (Many-to-Many Relationship between Leaders and Parties)
export const partyMemberships = pgTable('party_memberships', {
  id: serial('id').primaryKey(),
  partyId: integer('party_id').references(() => parties.id, { onDelete: 'cascade' }).notNull(),
  leaderId: integer('leader_id').references(() => leaders.id, { onDelete: 'cascade' }).notNull(),
  role: varchar('role', { length: 100 }).notNull(), // e.g., 'Member', 'Chairperson'
  startAt: timestamp('start_at', { withTimezone: true }).notNull(),
  endAt: timestamp('end_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// 12. ALLIANCES (Unregistered Political Alliances)
export const alliances = pgTable('alliances', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// 13. ALLIANCE_MEMBERSHIPS (Many-to-Many Relationship between Leaders and Alliances)
export const allianceMemberships = pgTable('alliance_memberships', {
  id: serial('id').primaryKey(),
  allianceId: integer('alliance_id').references(() => alliances.id, { onDelete: 'cascade' }).notNull(),
  leaderId: integer('leader_id').references(() => leaders.id, { onDelete: 'cascade' }).notNull(),
  role: varchar('role', { length: 100 }).notNull(), // e.g., 'Member', 'Chairperson'
  startAt: timestamp('start_at', { withTimezone: true }).notNull(),
  endAt: timestamp('end_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
export const subscriptionTierEnum = pgEnum('subscription_tier', ['aspirant', 'influencer', 'mobilizer']);
export const billingCycleEnum = pgEnum('billing_cycle', ['monthly', 'annual']);
export const subscriptionStatusEnum = pgEnum('subscription_status', ['pending', 'active', 'expired', 'cancelled']);
// How a subscription row came to exist: a fresh purchase, a same-tier renewal, or a tier change
export const subscriptionOriginEnum = pgEnum('subscription_origin', ['new', 'renewal', 'upgrade', 'downgrade']);

// 14. SUBSCRIPTIONS (Paid premium packages). Each purchase/renewal/upgrade is a NEW row; never mutate tier in place.
export const subscriptions = pgTable('subscriptions', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id').references(() => campaigns.id).notNull(), // no cascade, financial record must outlive the campaign row
  payerId: integer('payer_id').references(() => users.id).notNull(), // candidate or manager who paid
  tier: subscriptionTierEnum('tier').notNull(),
  billingCycle: billingCycleEnum('billing_cycle').notNull(),
  amount: integer('amount').notNull(), // KES, snapshot at purchase time (net of any upgrade proration credit)
  currency: varchar('currency', { length: 3 }).default('KES').notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  status: subscriptionStatusEnum('status').default('pending').notNull(),
  origin: subscriptionOriginEnum('origin').default('new').notNull(),
  previousSubscriptionId: integer('previous_subscription_id').references((): any => subscriptions.id, { onDelete: 'set null' }), // chains renewals/upgrades for audit
  startAt: timestamp('start_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(), // active if endsAt is in the future
  autoRenew: boolean('auto_renew').default(false).notNull(),
  paymentMethod: varchar('payment_method', { length: 30 }), // 'mpesa' | 'card' | 'bank'
  paymentReference: varchar('payment_reference', { length: 100 }).unique(), // gateway transaction id, for idempotent webhook handling
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // At most one live (active/pending) subscription per campaign; renewals supersede via previousSubscriptionId
  uniqueIndex('one_live_subscription_per_campaign')
    .on(t.campaignId)
    .where(sql`${t.status} in ('active', 'pending')`),
]);

// 15. PRICING (fix 6 — SRC-independent subscription rate card, versioned so a rate change never rewrites history)
export const pricing = pgTable('pricing', {
  id: serial('id').primaryKey(),
  band: priceBandEnum('band').notNull(),
  tier: subscriptionTierEnum('tier').notNull(),
  billingCycle: billingCycleEnum('billing_cycle').notNull(),
  amount: integer('amount').notNull(), // KES
  activeFrom: timestamp('active_from', { withTimezone: true }).defaultNow().notNull(),
  activeTo: timestamp('active_to', { withTimezone: true }), // null = current rate
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // Only one current rate per (band, tier, cycle); superseded rows get activeTo set
  uniqueIndex('one_current_rate')
    .on(t.band, t.tier, t.billingCycle)
    .where(sql`${t.activeTo} is null`),
]);

// 16. PAYMENTS (fix 5 — immutable ledger of actual charge events; subscriptions/credits reference these)
export const paymentPurposeEnum = pgEnum('payment_purpose', ['subscription', 'credits', 'feature', 'donation']);
export const paymentStatusEnum = pgEnum('payment_status', ['pending', 'success', 'failed', 'reversed']);

export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  payerId: integer('payer_id').references(() => users.id).notNull(),
  campaignId: integer('campaign_id').references(() => campaigns.id), // nullable: donations/platform charges aren't always campaign-scoped
  purpose: paymentPurposeEnum('purpose').notNull(),
  subscriptionId: integer('subscription_id').references(() => subscriptions.id), // set when purpose = 'subscription'
  amount: integer('amount').notNull(), // KES
  currency: varchar('currency', { length: 3 }).default('KES').notNull(),
  status: paymentStatusEnum('status').default('pending').notNull(),
  method: varchar('method', { length: 30 }).notNull(), // 'mpesa' | 'card' | 'bank'
  providerReference: varchar('provider_reference', { length: 100 }).unique(), // M-Pesa receipt / gateway id — idempotent webhooks
  metadata: jsonb('metadata').default({}), // raw gateway callback payload
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 17. WALLETS & CREDIT LEDGER (fix 5 — prepaid credits for broadcasts/features; balance is a cache of the ledger)
export const wallets = pgTable('wallets', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }).notNull().unique(),
  balance: integer('balance').default(0).notNull(), // running credit balance, reconciled from creditTransactions
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const creditTxnKindEnum = pgEnum('credit_txn_kind', ['topup', 'spend', 'refund', 'bonus']);

export const creditTransactions = pgTable('credit_transactions', {
  id: serial('id').primaryKey(),
  walletId: integer('wallet_id').references(() => wallets.id, { onDelete: 'cascade' }).notNull(),
  kind: creditTxnKindEnum('kind').notNull(),
  amount: integer('amount').notNull(), // signed: + for topup/refund/bonus, - for spend
  channel: varchar('channel', { length: 20 }), // 'email' | 'sms' | 'whatsapp' | 'feature' — the rate that was applied on spend
  paymentId: integer('payment_id').references(() => payments.id), // topups link to the payment that funded them
  reference: varchar('reference', { length: 100 }), // e.g. the post/broadcast id a spend paid for
  balanceAfter: integer('balance_after').notNull(), // wallet balance snapshot after this row, for audit
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('credit_txn_wallet_idx').on(t.walletId),
]);

// 18. OTP VERIFICATIONS & DEVICES (fix 7 — Safaricom OTP + fingerprinting to block single-phone farming)
export const otpChannelEnum = pgEnum('otp_channel', ['sms', 'whatsapp', 'email']);

export const verifications = pgTable('verifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  channel: otpChannelEnum('channel').notNull(),
  destination: varchar('destination', { length: 100 }).notNull(), // phone/email the code was sent to
  codeHash: varchar('code_hash', { length: 255 }).notNull(), // hashed OTP, never plaintext
  attempts: integer('attempts').default(0).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }), // set once verified, prevents replay
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('verifications_destination_idx').on(t.destination),
]);

export const devices = pgTable('devices', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  fingerprint: varchar('fingerprint', { length: 255 }).notNull(), // hashed device signature
  userAgent: text('user_agent'),
  ipAddress: varchar('ip_address', { length: 45 }), // 45 chars covers IPv6
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // NOT unique: farming detection = count distinct userIds sharing one fingerprint
  index('devices_fingerprint_idx').on(t.fingerprint),
  uniqueIndex('one_device_per_user').on(t.userId, t.fingerprint),
]);

// 20. AI CHAT (web pages + WhatsApp threads; scope reuses digestEnum, matching the blueprint's RAG scopes)
export const chatChannelEnum = pgEnum('chat_channel', ['web', 'whatsapp']);
export const chatSenderEnum = pgEnum('chat_sender', ['follower', 'ai', 'leader', 'manager', 'ambassador']);
export const chatTargetEnum = pgEnum('chat_target', ['leader', 'manager', 'ambassador']);

export const conversations = pgTable('conversations', {
  id: serial('id').primaryKey(),
  scope: digestEnum('scope').notNull(), // platform | position | leader | campaign — same RAG scoping as follows
  scopeId: integer('scope_id'), // the position/leader/campaign id; null for platform-wide (home) chat
  channel: chatChannelEnum('channel').notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }), // null for anonymous web visitors
  followerId: integer('follower_id').references(() => followers.id, { onDelete: 'set null' }), // set when a WhatsApp thread starts from a follow notification
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('conversations_scope_idx').on(t.scope, t.scopeId),
]);

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  conversationId: integer('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }).notNull(),
  sender: chatSenderEnum('sender').notNull(), // follower | ai | leader | manager | ambassador
  senderId: integer('sender_id').references(() => users.id), // null for ai replies and anonymous visitors
  target: chatTargetEnum('target'), // from an "L:"/"M:"/"A:" prefix — which human the follower is addressing; null routes to the AI
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('messages_conversation_idx').on(t.conversationId),
]);

// Better-auth generated tables (run: bun run auth:schema)
export * from './auth.schema';
