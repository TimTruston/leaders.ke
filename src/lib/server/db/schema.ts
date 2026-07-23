import { pgTable, serial, varchar, text, boolean, integer, bigint, timestamp, jsonb, customType, pgEnum, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user } from './auth.schema'; // better-auth owns login; users below is the 1:1 domain profile
import type { ManagerRoles } from '$lib/utils/campaignRoles';

export const vector = customType<{ data: number[] }>({
  dataType: () => 'vector(1536)', // Optimizing for OpenAI embeddings length
});

// Pricing band for a position. Groups don't follow boundary: MP is constituency-level but priced with 'regional'.
// national = President/VP; regional = Governor/Senator/MP/Women Rep; ward = MCA
// MP is constituency-level but priced with county group.
export const priceBandEnum = pgEnum('price_band', ['national', 'regional', 'ward']);

// 1. POSITION (Elective & Nominated Leadership Positions)
// Every elective or nominated seat that exists to be filled.
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
// Every signed-up person's domain profile: name and bio, one per login.
// better-auth owns email/password/OAuth/sessions; phones live in `contacts`.)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  authUserId: text('auth_user_id').references(() => user.id, { onDelete: 'cascade' }).notNull().unique(),
  firstName: varchar('first_name', { length: 50 }).notNull(), // single word, no spaces (enforced at signup)
  otherNames: varchar('other_names', { length: 100 }).notNull(), // surname + any middle names, e.g. "Van Der Berg"
  bio: text('bio'),
  address: varchar('address', { length: 200 }),
  socials: jsonb('socials').$type<Record<string, string>>().default({}).notNull(), // platform -> profile URL, e.g. { twitter: 'https://...' }
  // Permanent /[slug] identity, e.g. "kalonzo-musyoka" (suffixed "-2" etc on collision).
  // Lives here (not on leaders) because it's the PERSON's URL: one user can have several
  // leaders rows (Track Record spanning multiple seats/terms) sharing this one slug.
  slug: varchar('slug', { length: 120 }),
  // Per-channel verification flags — set once each contact channel's OTP succeeds.
  // Denormalized here (alongside the matching `contacts.verifiedAt` timestamp) so
  // dashboard/login gating reads it for free off the `users` row
  // `requireDashboardUser` already loads, no extra `contacts` query.
  verified: jsonb('verified')
    .$type<{ email: boolean; sms: boolean; whatsapp: boolean }>()
    .default({ email: false, sms: false, whatsapp: false })
    .notNull(),
  // The person's portrait and national-ID scans. On the PERSON (not a leaders term):
  // a photo and an identity follow someone across every candidacy and term, and a
  // manager's own ID sign-off lives on their own row too. ID scans are never public.
  // Local-disk URLs for now (see $lib/server/storage.ts).
  photoUrl: text('photo_url'),
  // The person's national ID number, captured up front at onboarding (the sign-off
  // step). Person-scoped like the ID scans below: an identity follows someone across
  // every candidacy and term. Never public.
  nationalId: varchar('national_id', { length: 20 }),
  idFrontUrl: text('id_front_url'),
  idBackUrl: text('id_back_url'),
  // An admin has manually confirmed nationalId + idFrontUrl + idBackUrl + photoUrl
  // all belong to this person — set once, reused across every profile they manage
  // (identity doesn't change per profile). A badge only, like every other
  // verifiedAt (see docs/URLDiscovery.md); never a visibility gate.
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  adminAt: timestamp('admin_at', { withTimezone: true }), // platform admin, set manually for now (no self-serve path)
  // An onboarding "Existing leader" claim that collided with an already-seeded
  // incumbent at the same seat (see onboard.ts's notifyAdminsOfLeaderConflict) —
  // no real `leaders` row could be written (only one 'current' per seat,
  // platform-wide), so the claimed seat/party live here instead, purely so the
  // Profile tab can still show what the citizen said pending an admin's review.
  // Cleared once an admin resolves the conflict one way or the other.
  pendingCurrentPositionId: integer('pending_current_position_id').references(() => positions.id, { onDelete: 'set null' }),
  pendingCurrentPartyId: integer('pending_current_party_id').references(() => parties.id, { onDelete: 'set null' }),
  // Channel-level opt-in for platform notifications (new posts from followed leaders,
  // invite alerts, etc.) — simple on/off per channel, not per notification category.
  notificationPrefs: jsonb('notification_prefs')
    .$type<{ email: boolean; sms: boolean; whatsapp: boolean }>()
    .default({ email: true, sms: true, whatsapp: true })
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('one_user_per_slug').on(t.slug).where(sql`${t.deletedAt} is null`),
]);

// 2.1 CONTACTS (per-channel reachable addresses; each verified independently via the otps table)
// A real table here (not a jsonb column on users) buys three things a blob can't:
// - Cardinality: a channel's value can change over time (old phone replaced, etc.)
//   without losing the ability to tell "the live one" from history — soft-deleted
//   rows keep that history instead of being overwritten in place.
// - Uniqueness: `one_value_per_channel` below is a real, database-enforced
//   constraint spanning every user, not just one row's own data — it's what makes
//   "you can't verify a number someone else already verified" actually race-safe.
// - Channel extensibility: adding whatsapp alongside sms/email was a new enum
//   value, not a new column (and a new unique index, and new app-level filtering).
export const contactChannelEnum = pgEnum('contact_channel', ['sms', 'whatsapp', 'email']);

// A user's contacts, one row per channel.
export const contacts = pgTable('contacts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  channel: contactChannelEnum('channel').notNull(),
  value: varchar('value', { length: 100 }).notNull(), // phone number or email address
  isPrimary: boolean('is_primary').default(false).notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }), // set once OTP succeeds
  // Provenance for contacts harvested from public directories (parliament.go.ke,
  // Mzalendo) rather than entered by the person themselves. A sourced-but-unverified
  // email is good enough to SEND to (e.g. the leader-accepted-claims link) but never
  // renders as "Verified" — only an OTP sets verifiedAt.
  source: jsonb('source').$type<{ url: string; publisher: string; fetchedAt: string }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  // One live owner per (channel, value): the same phone/email can't attach to two accounts (anti-farming)
  uniqueIndex('one_value_per_channel').on(t.channel, t.value).where(sql`${t.deletedAt} is null`),
  index('contacts_user_idx').on(t.userId),
]);

// 3. LEADERS (Public profiles connected to Users and positions. Tracks the service history of leaderships)
// One person holding, or vying for, one position — the core public profile.
export const leaders = pgTable('leaders', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  positionId: integer('position_id').references(() => positions.id).notNull(),
  faq: jsonb('faq').default([]),
  contacts: jsonb('contacts').default({}),
  status: varchar('status', { length: 30 }).default('current').notNull(), // 'current' | 'former' (a run for office is a campaign, not a leaders row)
  description: varchar('description', { length: 255 }), // short seat-name qualifier, e.g. "Former Eldoret North" when a seat was renamed/redrawn
  // The party this SPECIFIC term was served under — a person can switch parties
  // between terms, so this is denormalized per term rather than inferred from
  // partyMemberships' current (live) row, which only tracks their party today.
  // Null = not recorded / independent for this term.
  partyId: integer('party_id').references(() => parties.id, { onDelete: 'set null' }),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  startAt: timestamp('start_at', { withTimezone: true }).notNull(), // aspirant candidates have a future start date
  endAt: timestamp('end_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  // At most one live 'current' leader per position (partial unique index)
  uniqueIndex('one_current_per_position')
    .on(t.positionId)
    .where(sql`${t.status} = 'current' and ${t.deletedAt} is null`),
]);

// 3.1 EXPERIENCE (education, professional and leadership history on a leader's profile)
export const experienceTypeEnum = pgEnum('experience_type', ['education', 'professional']);

// One line of a person's history: a school, a job, or a prior office held. On the
// PERSON (not a leaders term): education and professional history follow someone
// across every candidacy and term, and an aspirant with no leaders row still has one.
export const experience = pgTable('experience', {
  id: serial('id').primaryKey(),
  subjectUserId: integer('subject_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  type: experienceTypeEnum('type').notNull(),
  positionId: integer('position_id').references(() => positions.id), // set when type = 'leadership'
  title: varchar('title', { length: 255 }).notNull(),
  institution: varchar('institution', { length: 255 }).notNull(),
  description: varchar('description', { length: 500 }), // free-text detail of what the role involved or achieved
  startAt: timestamp('start_at', { withTimezone: true }), // null when the source only gave a free-text/unparseable range
  endAt: timestamp('end_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('experience_subject_idx').on(t.subjectUserId),
]);

// 4. MANIFESTO PILLARS - A leader's policy platform

// Public delivery tracker: every pillar carries a status citizens can verify.
export const deliveryStatusEnum = pgEnum('delivery_status', ['promised', 'in_progress', 'delivered']);

// One promise within a manifesto, with a publicly-visible delivery status.
export const pillars = pgTable('pillars', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  summary: text('summary').notNull(),
  deliveryStatus: deliveryStatusEnum('delivery_status').default('promised').notNull(),
  evidence: text('evidence'), // public proof of delivery, e.g. "7 of 10 dispensaries built: <link>"
  sortOrder: integer('sort_order').default(0).notNull(), // manager-controlled display order (drag-and-drop), not creation order
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// 4.1 PILLAR TEMPLATES (admin-curated manifesto starting points, one catalog per
// office level, e.g. "President"). A candidate picks one on their Campaign tab's
// manifesto section to prefill their own pillar's title/summary, or writes a
// custom one instead — picking a template never links back to it, it's just a
// starting draft.
export const pillarTemplates = pgTable('pillar_templates', {
  id: serial('id').primaryKey(),
  positionTitle: varchar('position_title', { length: 50 }).notNull(), // matches positions.title, e.g. "Governor"
  title: varchar('title', { length: 255 }).notNull(),
  summary: text('summary').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('pillar_templates_position_idx').on(t.positionTitle),
]);

// 5. CAMPAIGNS (Nested Campaign Architectures)
// A leader's push for office, or a mission nested under one.
export const campaigns = pgTable('campaigns', {
  id: serial('id').primaryKey(),
  creatorId: integer('creator_id').references(() => users.id).notNull(),
  // The PERSON whose run this is. A campaign belongs to a person (their run at a
  // seat in a cycle), not to a leaders term — an aspirant has a campaign and no
  // leaders row at all. leaderId below is set only once the run is tied to a held
  // term (a graduated winner, or an incumbent's re-election), null for a pure run.
  subjectUserId: integer('subject_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  leaderId: integer('leader_id').references(() => leaders.id, { onDelete: 'cascade' }),
  // A campaign IS one run at one seat in one cycle, so it names them itself
  // (not via its leaders row): the seat contested and the election year.
  positionId: integer('position_id').references(() => positions.id).notNull(),
  cycleYear: integer('cycle_year').notNull(), // e.g. 2027 — the election year of this run
  // The party this RUN is contested under — a person can switch parties between
  // cycles, so this is denormalized per campaign (same pattern as leaders.partyId),
  // not a person-level fact. Null = independent/not recorded.
  partyId: integer('party_id').references(() => parties.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description').notNull(), // Rich text payload
  // A run is admin-verified independently of any held term (the aspirant has no
  // leaders row to carry verifiedAt). Set = the run is public and ballot-eligible;
  // null = still under review / dashboard-only. Mirrors leaders.verifiedAt for held office.
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  // When the owner clicked Submit for Verification (checklist complete at that
  // moment) — lets the dashboard show "pending review" instead of the button, and
  // stops it from re-emailing admins on every click. Cleared by the admin's
  // Verify/Unverify toggle, or automatically if the checklist goes incomplete again.
  verificationRequestedAt: timestamp('verification_requested_at', { withTimezone: true }),
  // The IEBC nomination certificate is issued per election, per seat run.
  // The person's photo and ID scans live on `users`.
  iebcCertificateUrl: text('iebc_certificate_url'),
  fundraisingGoal: integer('fundraising_goal').default(0).notNull(), // KES — money belongs to the run, not the term
  faq: jsonb('faq').default([]),
  parentCampaignId: integer('parent_campaign_id').references((): any => campaigns.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  // Exactly one live MAIN campaign per person per cycle: someone runs for at most
  // one seat in a given election year. Sub-campaigns (parentCampaignId set) are
  // unrestricted. Keyed on the person (not a leaders term) so an aspirant with no
  // leaders row is still bound by it.
  uniqueIndex('one_main_campaign_per_person_cycle')
    .on(t.subjectUserId, t.cycleYear)
    .where(sql`${t.parentCampaignId} is null and ${t.deletedAt} is null`),
  index('campaigns_leader_idx').on(t.leaderId),
]);

// 6. MANAGEMENT & AMBASSADORS (JSONB Configured Access Controls)
// A person granted access to run a leader's dashboard on their behalf.
export const managers = pgTable('managers', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(), // the manager granted access; soft delete handles detachment
  // The PERSON being managed (users, not a leaders term): one manages a person, never a
  // single candidacy — authority spans their whole Track Record and every campaign.
  subjectUserId: integer('subject_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  // Per-manager: admin flag + this manager's own sign-off (their role title and national
  // ID number). Never shared across the team — each member attests separately. Their ID
  // images live on the manager's own users row (idFrontUrl/idBackUrl), not here.
  roles: jsonb('roles').$type<ManagerRoles>().default({}).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  // Identity verification moved to users.verifiedAt (one per PERSON, reused across
  // every profile they manage) — this dead write-only column is gone.
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  // One live manager row per (manager, person) — person-scoped management can't duplicate.
  uniqueIndex('one_manager_per_person').on(t.userId, t.subjectUserId).where(sql`${t.deletedAt} is null`),
]);

// A person who mobilizes citizens on the ground for a candidate's campaign.
// Attached to the PERSON (subjectUserId), not a leaders term — a pure aspirant
// has no leaders row but can still take on ambassadors (they mobilize for the
// person's run). Follows the ambassador creates are person-scoped too.
export const ambassadors = pgTable('ambassadors', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  subjectUserId: integer('subject_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  managerId: integer('manager_id').references(() => managers.id),
  campaignId: integer('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }),
  roles: jsonb('roles').default({}).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// 6.1 INVITES (onboarding.md: how a worker joins a campaign as manager or ambassador.
// Single-use token; accepting creates the managers/ambassadors row directly.)
export const inviteRoleEnum = pgEnum('invite_role', ['manager', 'ambassador', 'follower']);

// A one-time invite link a leader/manager sends to bring someone onto the team.
export const invites = pgTable('invites', {
  id: serial('id').primaryKey(),
  token: varchar('token', { length: 64 }).notNull().unique(),
  // The PERSON whose team the invitee joins (managers are person-scoped; an
  // ambassador accept resolves this person to their active term at accept time).
  subjectUserId: integer('subject_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  role: inviteRoleEnum('role').notNull(),
  email: varchar('email', { length: 255 }).notNull(), // who it was sent to; only they can accept it
  createdBy: integer('created_by').references(() => users.id).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  usedBy: integer('used_by').references(() => users.id), // set once accepted; null = still open
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }), // revoked before use
});

// 6.2 VERIFICATIONS (onboarding.md: pay-after-approval. A leader submits evidence,
// an admin reviews it; approval is what sets leaders.verifiedAt and makes the
// profile public. One pending (outcome null) request per leader at a time.)
export const verificationOutcomeEnum = pgEnum('verification_outcome', ['approved', 'rejected']);

// One run's request to be verified, with the admin's decision once reviewed. A
// candidacy (campaign) is the verifiable unit — approval sets campaigns.verifiedAt.
export const verifications = pgTable('verifications', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  requestedBy: integer('requested_by').references(() => users.id).notNull(),
  evidence: jsonb('evidence').default({}).notNull(), // IEBC clearance doc reference / national ID, etc.
  requestedAt: timestamp('requested_at', { withTimezone: true }).defaultNow().notNull(),
  reviewedBy: integer('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  outcome: verificationOutcomeEnum('outcome'), // null = pending
  notes: text('notes'), // admin's reason, shown back to the leader on rejection
}, (t) => [
  uniqueIndex('one_pending_verification_per_campaign').on(t.campaignId).where(sql`${t.outcome} is null`),
]);

// 6.3 PROFILE CLAIMS (onboarding.md option A: "Claim this Profile" on an existing
// leader page. Deliberately does NOT reassign leaders.userId — that would mean
// merging two people rows and everything hanging off them, real data-integrity
// risk for a rare case. Approval instead makes the claimant an admin manager of
// the existing profile, reusing the managers table's access-control exactly like
// an accepted team invite. The original seeded owner row is left alone; it never
// logs in, so it never matters.)
export const claimOutcomeEnum = pgEnum('claim_outcome', ['approved', 'rejected']);

// One signed-in user's claim to be the real person behind an existing leader profile.
export const profileClaims = pgTable('profile_claims', {
  id: serial('id').primaryKey(),
  // The PERSON being claimed — a claim asserts "I am / I represent this person",
  // never one candidacy term of theirs.
  subjectUserId: integer('subject_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  claimedBy: integer('claimed_by').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  evidence: jsonb('evidence').default({}).notNull(), // national ID + a note on why it's them
  requestedAt: timestamp('requested_at', { withTimezone: true }).defaultNow().notNull(),
  reviewedBy: integer('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  outcome: claimOutcomeEnum('outcome'), // null = pending
  notes: text('notes'),
  // The claimant's own "just testing" escape hatch — soft-deleted so a rejected
  // claim's decision stays in the admin's audit trail instead of disappearing.
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('one_pending_claim_per_person_per_user')
    .on(t.subjectUserId, t.claimedBy)
    .where(sql`${t.outcome} is null and ${t.deletedAt} is null`),
]);

// 6.4 NOTIFICATIONS (durable in-app notifications, e.g. "your verification was
// approved/rejected because …". Written alongside the matching email by notifyUser
// ($lib/server/notifications) — the flash cookie can't carry these because the
// decision happens in the ADMIN's session, not the applicant's. Unread rows banner
// on the applicant's dashboard until dismissed.)
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(), // the recipient
  kind: varchar('kind', { length: 30 }).notNull(), // 'verification' | 'claim' | 'moderation' — what the notification is about
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body').notNull(), // includes the admin's reason on rejections
  href: text('href'), // where "view" should land, e.g. the application page
  readAt: timestamp('read_at', { withTimezone: true }), // null = unread, still bannered
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('notifications_unread_idx').on(t.userId).where(sql`${t.readAt} is null`),
]);

// 7. EVENTS
// A physical or scheduled gathering tied to a campaign.
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
// Any published update: a campaign post, a broadcast, or an aggregated news mention.
export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  creatorId: integer('creator_id').references(() => users.id), // system-aggregated posts can have a null creatorId
  // The PERSON who speaks/is spoken about — a post follows them across terms.
  // campaignId still tags a post to one run when it belongs to that campaign.
  subjectUserId: integer('subject_user_id').references(() => users.id, { onDelete: 'cascade' }),
  campaignId: integer('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  // Permanent /news/[slug] identity for a public web post (suffixed "-2" etc on
  // collision). Null for non-web posts (broadcasts) and aggregated mentions.
  slug: varchar('slug', { length: 160 }),
  body: text('body').notNull(),
  aiSummary: text('ai_summary'),
  manualSummary: text('manual_summary'),
  medium: varchar('medium', { length: 50 }).notNull(), // 'web' | 'sms' | 'whatsapp'
  approved: boolean('approved').default(false).notNull(),
  public: boolean('public').default(false).notNull(),
  votes: integer('votes').default(0).notNull(), // "likes" in the News CMS
  views: integer('views').default(0).notNull(),
  tags: jsonb('tags').$type<string[]>().default([]).notNull(), // free-form author tags, News CMS "Tags" section
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true }), // News CMS "Archive" section; distinct from deletedAt
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('one_post_per_slug').on(t.slug).where(sql`${t.deletedAt} is null`),
]);

// 8.1 FEATURED
// A post that's been paid to appear promoted on the homepage or directory.
export const featured = pgTable('featured', {
  id: serial('id').primaryKey(),
  postId: integer('post_id').references(() => posts.id, { onDelete: 'cascade' }).notNull(),
  summary: varchar('summary', { length: 255 }).notNull(),
  price: integer('price').default(0).notNull(), // how much they paid to feature the post
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// 8.1 BANNED
// A post moderated off the platform, with the reason it was taken down.
export const banned = pgTable('banned', {
  id: serial('id').primaryKey(),
  postId: integer('post_id').references(() => posts.id, { onDelete: 'cascade' }).notNull(),
  reason: varchar('reason', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// 8.3 TAGS
// Links a news post to the leader(s) it mentions.
export const tags = pgTable('tags', {
  id: serial('id').primaryKey(),
  creatorId: integer('creator_id').references(() => users.id, { onDelete: 'cascade' }), // nullable if the tag is system-generated
  postId: integer('post_id').references(() => posts.id, { onDelete: 'cascade' }).notNull(),
  subjectUserId: integer('subject_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(), // the PERSON tagged in the post
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// 9. ISSUES (Civic Feedback Engine)
// A civic topic citizens raise and vote on, tied to a position.
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
// A threaded, votable reply on a post or an issue.
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

// 11. FOLLOWERS (Users OR anonymous citizens following Campaigns, Leaders or Positions.
// userId is nullable: citizens follow with just a name + phone/email, no account needed;
// geo columns power ward/constituency-targeted broadcasts.)
// A citizen subscribed to a leader's, campaign's, or position's updates.
export const followers = pgTable('followers', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }), // null for account-less follows
  name: varchar('name', { length: 100 }), // display name for account-less follows
  phoneNumber: varchar('phone_number', { length: 20 }),
  emailAddress: varchar('email_address', { length: 100 }),
  county: varchar('county', { length: 50 }),
  constituency: varchar('constituency', { length: 50 }),
  ward: varchar('ward', { length: 50 }),
  digest: digestEnum('digest').notNull(),
  digestId: integer('digest_id'), // polymorphic: positions/campaigns id, or the PERSON's users.id for digest 'leader'; null for platform-wide follow
  email: boolean('email').default(false).notNull(),
  sms: boolean('sms').default(false).notNull(),
  whatsapp: boolean('whatsapp').default(false).notNull(),
  // Who recruited this follower (ambassador/manager adding a citizen via the
  // dashboard, blueprint funnel A); null for self-service follows.
  addedBy: integer('added_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  // One live follow per (user, target) for signed-in follows. coalesce(digestId, 0) makes
  // platform-wide (null) dedupe too; account-less rows (null userId) dedupe at the app layer
  // by (digest, digestId, emailAddress/phoneNumber) since NULL never collides in unique indexes.
  uniqueIndex('one_follow_per_target')
    .on(t.userId, t.digest, sql`coalesce(${t.digestId}, 0)`)
    .where(sql`${t.deletedAt} is null`),
  index('followers_target_idx').on(t.digest, t.digestId),
]);

// 12. FILES
// An uploaded media asset attached to a leader profile or campaign.
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

// 12. PARTIES (Political Parties, per the ORPP register)
// A registered political party a leader can belong to.
export const parties = pgTable('parties', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(), // full registered name, e.g. 'United Democratic Alliance'
  abbreviation: varchar('abbreviation', { length: 30 }), // e.g. 'UDA'
  slogan: text('slogan'),
  description: text('description'),
  symbol: text('symbol'), // ORPP-registered symbol, e.g. 'Wheelbarrow'
  colors: text('colors'), // ORPP-registered colors, e.g. 'Green and Yellow'
  logo: text('logo'), // logo image URL, once uploaded
  contacts: jsonb('contacts').default({}), // phone/email, not in the ORPP register
  postal: text('postal'), // postal address
  hq: text('hq'), // physical head office address
  status: varchar('status', { length: 20 }).notNull(), // 'full' | 'provisional' registration status
  notes: text('notes'), // e.g. 'Formerly Wiper Democratic Movement (WDM)'
  certifiedAt: timestamp('certified_at', { withTimezone: true }), // ORPP certificate date of issue
  verifiedAt: timestamp('verified_at', { withTimezone: true }), // platform verification, distinct from ORPP certification
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// 12. ALLIANCES (Unregistered Political Alliances)
// An informal coalition of parties/leaders, outside formal party registration.
export const alliances = pgTable('alliances', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// 13. ALLIANCE_MEMBERSHIPS (Many-to-Many Relationship between Leaders and Alliances)
// Links a leader to an alliance for a given stretch of time.
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
// A campaign's paid package (tier + billing cycle), one live row per campaign.
export const subscriptions = pgTable('subscriptions', {
  id: serial('id').primaryKey(),
  // The PERSON the subscription is for (billing is user-scoped: a leader pays for their
  // presence on the platform, whatever they are running for). No cascade — a financial
  // record must outlive any profile row.
  subjectUserId: integer('subject_user_id').references(() => users.id).notNull(),
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
  // At most one live (active/pending) subscription per person; renewals supersede via previousSubscriptionId
  uniqueIndex('one_live_subscription_per_person')
    .on(t.subjectUserId)
    .where(sql`${t.status} in ('active', 'pending')`),
]);

// 15. PRICING (fix 6 — SRC-independent subscription rate card, versioned so a rate change never rewrites history)
// The current subscription rate for a given office band, tier, and billing cycle.
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

// What each package INCLUDES (the caps), one row per (band, tier) — prices live in
// `pricing` above. Seeded from src/lib/data/packages.json; admin-editable on
// /dashboard/admin/packages. null = unlimited.
export type PackageFeatures = {
  pages: number | null;
  managers: number | null;
  ambassadors: number | null;
  subscriptions: number | null;
  storageMb: number | null;
  eventsPerWeek: number | null;
};

export const packages = pgTable('packages', {
  id: serial('id').primaryKey(),
  band: priceBandEnum('band').notNull(),
  tier: subscriptionTierEnum('tier').notNull(),
  features: jsonb('features').$type<PackageFeatures>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('one_package_per_band_tier').on(t.band, t.tier),
]);

// 16. PAYMENTS (fix 5 — immutable ledger of actual charge events; subscriptions/credits reference these)
export const paymentPurposeEnum = pgEnum('payment_purpose', ['subscription', 'credits', 'feature', 'donation']);
export const paymentStatusEnum = pgEnum('payment_status', ['pending', 'success', 'failed', 'reversed']);

// An immutable record of one real-money charge, whatever it was for.
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
// A campaign's current prepaid credit balance, one row per campaign.
export const wallets = pgTable('wallets', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }).notNull().unique(),
  balance: integer('balance').default(0).notNull(), // running credit balance, reconciled from creditTransactions
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const creditTxnKindEnum = pgEnum('credit_txn_kind', ['topup', 'spend', 'refund', 'bonus']);

// One event that moved a wallet's balance: a topup, a spend, a refund, or a bonus.
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

// 18. OTPS & DEVICES (fix 7 — Safaricom OTP + fingerprinting to block single-phone farming)
// Named `otps`, not `verifications`, to avoid colliding with better-auth's own
// internal `verification` table in auth.schema.ts (unrelated email-link tokens).
// Offers same benefits listed above contacts table
export const otpChannelEnum = pgEnum('otp_channel', ['sms', 'whatsapp', 'email']);

// A one-time passcode sent to verify a phone number or email.
export const otps = pgTable('otps', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  channel: otpChannelEnum('channel').notNull(),
  destination: varchar('destination', { length: 100 }).notNull(), // phone/email the code was sent to
  codeHash: varchar('code_hash', { length: 255 }).notNull(), // hashed OTP, never plaintext
  // Short click-through alternative to typing the code (email channel only) — a
  // 32-char random token, stored raw (like invites.token) since it's never user-typed.
  linkToken: varchar('link_token', { length: 32 }),
  attempts: integer('attempts').default(0).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }), // set once verified, prevents replay
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('otps_destination_idx').on(t.destination),
  index('otps_link_token_idx').on(t.linkToken),
]);

// A device fingerprint seen for a user, used to detect single-phone farming.
export const devices = pgTable('devices', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  fingerprint: varchar('fingerprint', { length: 255 }).notNull(), // hashed device signoff
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

// One chat thread, scoped to the platform, a position, a leader, or a campaign.
export const conversations = pgTable('conversations', {
  id: serial('id').primaryKey(),
  scope: digestEnum('scope').notNull(), // platform | position | leader | campaign — same RAG scoping as follows
  scopeId: integer('scope_id'), // the position/campaign id, or the PERSON's users.id for scope 'leader'; null for platform-wide (home) chat
  channel: chatChannelEnum('channel').notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }), // null for anonymous web visitors
  followerId: integer('follower_id').references(() => followers.id, { onDelete: 'set null' }), // set when a WhatsApp thread starts from a follow notification
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('conversations_scope_idx').on(t.scope, t.scopeId),
]);

// One message within a conversation, from a follower, the AI, or a team member.
export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  conversationId: integer('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }).notNull(),
  sender: chatSenderEnum('sender').notNull(), // follower | ai | leader | manager | ambassador
  senderId: integer('sender_id').references(() => users.id), // null for ai replies and anonymous visitors
  target: chatTargetEnum('target'), // from an "L:"/"M:"/"A:" prefix — which human the follower is addressing; null routes to the AI
  reviewId: integer('review_id').references((): any => reviews.id, { onDelete: 'set null' }), // set when the thread responds to a citizen review
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('messages_conversation_idx').on(t.conversationId),
]);

// 21. PLEDGES (a citizen pledging their vote to a campaign, created by the
// /vote/2027 ballot simulator. Signed-in voters pledge by userId; anonymous
// voters by anonId, a long-lived device cookie. Insert code enforces that at
// least one of the two is present.)
// One citizen's live vote pledge to a campaign.
export const pledges = pgTable('pledges', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }), // null for anonymous pledges
  anonId: varchar('anon_id', { length: 32 }), // anonymous device id from the 'anon_id' cookie
  campaignId: integer('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  simulationId: integer('simulation_id').references((): any => ballotSimulations.id, { onDelete: 'set null' }), // the ballot simulation that created this pledge
  ip: varchar('ip', { length: 45 }), // abuse-detection metadata only, never identity; 45 chars covers IPv6
  userAgent: varchar('user_agent', { length: 255 }),
  // Contact capture, copied from the ballot form only when the citizen consented
  // to be contacted about candidates in their area; null otherwise.
  name: varchar('name', { length: 100 }),
  sms: varchar('sms', { length: 20 }), // SMS number
  whatsapp: varchar('whatsapp', { length: 20 }), // WhatsApp number
  email: varchar('email', { length: 100 }),
  constituency: varchar('constituency', { length: 100 }),
  ward: varchar('ward', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  // One live pledge per campaign per signed-in user, and per anonymous device
  uniqueIndex('one_pledge_per_user_campaign')
    .on(t.campaignId, t.userId)
    .where(sql`${t.deletedAt} is null and ${t.userId} is not null`),
  uniqueIndex('one_pledge_per_anon_campaign')
    .on(t.campaignId, t.anonId)
    .where(sql`${t.deletedAt} is null and ${t.anonId} is not null`),
]);

// 21.1 REVIEWS (citizen reviews of a leader: a 1-5 star rating plus a message,
// optionally aimed at one manifesto pillar. Public by default; a flagReason
// hides it from public view pending the leader/manager's response, but never
// deletes it outright — flagging is reversible, unlike a reject.)
export const reviewFlagReasonEnum = pgEnum('review_flag_reason', [
  'spam',
  'insult',
  'incitement',
  'hate_speech',
  'misinformation',
  'other',
]);

// One citizen's review of a leader.
export const reviews = pgTable('reviews', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(), // the reviewer
  // The person being reviewed, on `users` not `leaders`: a review of conduct as senator
  // must stay attached to them when they're later vying for president (or any other seat).
  subjectId: integer('subject_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  public: boolean('public').default(false).notNull(), // show the reviewer's name; the review itself still displays anonymously when false
  pillarId: integer('pillar_id').references(() => pillars.id, { onDelete: 'set null' }), // the manifesto pillar the review targets, if any
  rating: integer('rating').notNull(), // 1-5 stars, validated server-side
  likes: integer('likes').default(0).notNull(),
  message: text('message').notNull(),
  flagReason: reviewFlagReasonEnum('flag_reason'), // null = visible publicly; set = hidden pending review
  flaggedAt: timestamp('flagged_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('reviews_subject_idx').on(t.subjectId),
]);

// 22. DONATIONS (Phase 4 fundraising ledger. M-Pesa STK push replaces the manual
// confirm flow once Daraja credentials land; reference then stores the receipt.)
export const donationStatusEnum = pgEnum('donation_status', ['pending', 'confirmed', 'failed']);

// One campaign-fundraising donation from a citizen — money belongs to the run.
export const donations = pgTable('donations', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  donorName: varchar('donor_name', { length: 100 }).notNull(),
  phoneNumber: varchar('phone_number', { length: 20 }),
  amount: integer('amount').notNull(), // KES
  status: donationStatusEnum('status').default('pending').notNull(),
  reference: varchar('reference', { length: 100 }), // M-Pesa receipt once integrated
  isPublic: boolean('is_public').default(true).notNull(), // donor consented to appear on the donor wall
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('donations_campaign_idx').on(t.campaignId, t.status),
]);

// 23. BALLOT SIMULATIONS (/vote/2027: a single simulated ballot event per citizen, not one row
// per level. `selections` stores a candidateId per level so the share page re-fetches live
// candidate data instead of freezing it — a later profile update or verification shows up automatically.)
// One citizen's simulated 2027 ballot: their picks at every level, for sharing.
export const ballotSimulations = pgTable('ballot_simulations', {
  id: serial('id').primaryKey(),
  publicId: varchar('public_id', { length: 12 }).notNull().unique(), // the /vote/2027/[publicId] slug
  county: varchar('county', { length: 100 }).notNull(),
  constituency: varchar('constituency', { length: 100 }).notNull(),
  ward: varchar('ward', { length: 100 }).notNull(),
  pollingStation: varchar('polling_station', { length: 150 }),
  // { president, governor, senator, womanRep, mp, mca } -> candidateId string ("db:<leaderId>" | "mock:<slug>") | null
  selections: jsonb('selections').notNull(),
  voterName: varchar('voter_name', { length: 100 }), // opt-in, never rendered on the share page
  voterContact: varchar('voter_contact', { length: 100 }), // opt-in phone or email, never rendered on the share page
  consentedToContact: boolean('consented_to_contact').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 24. PLATFORM SETTINGS (single-row config an admin can tune without a deploy —
// OTP/invite anti-abuse thresholds today, room to grow. Always id=1.)

// Default for platformSettings.blockedSlugs, shared with the seed process
// (scripts/lib/seed-platform-settings.ts backfills these into an existing row).
export const DEFAULT_BLOCKED_SLUGS = [
  // routes a leader slug must never shadow
  'apply', 'account', 'admin', 'ambassador', 'citizen', 'invites', 'leaders', 'pricing',
  'compare', 'rank', 'ranks', 'vote', 'search', 'parties', 'alliances', 'invite', 'claim',
  // position words: the seat-hub routes (/president, /mca/...) and the /rank
  // plurals — no leader may take a seat name as their personal URL
  'president', 'presidents', 'deputy-president', 'deputy-presidents',
  'governor', 'governors', 'senator', 'senators', 'mp', 'mps', 'mca', 'mcas',
  'woman-rep', 'woman-reps', 'women-rep', 'women-reps',
  'woman-representative', 'woman-representatives', 'women-representative', 'women-representatives',
  // other Kenyan leadership titles (current and historical) — not routes, but a
  // personal URL like /cabinet-secretary or /chief would read as an official page
  'cabinet-secretary', 'cabinet-secretaries', 'principal-secretary', 'principal-secretaries',
  'chief-administrative-secretary', 'chief-administrative-secretaries',
  'minister', 'ministers', 'assistant-minister', 'assistant-ministers',
  'prime-minister', 'prime-ministers', 'deputy-prime-minister', 'deputy-prime-ministers',
  'vice-president', 'vice-presidents', 'deputy-governor', 'deputy-governors',
  'attorney-general', 'solicitor-general', 'chief-justice', 'deputy-chief-justice',
  'judge', 'judges', 'magistrate', 'magistrates',
  'speaker', 'speakers', 'deputy-speaker', 'deputy-speakers',
  'majority-leader', 'minority-leader', 'chief-whip',
  'member-of-parliament', 'members-of-parliament',
  'member-of-county-assembly', 'members-of-county-assembly',
  'councillor', 'councillors', 'mayor', 'mayors', 'deputy-mayor',
  'chief', 'chiefs', 'assistant-chief', 'assistant-chiefs',
  'county-commissioner', 'county-commissioners', 'inspector-general', 'head-of-public-service',
  'high-commissioner', 'cs', 'ps', 'dp', 'pm', 'ag', 'cj', 'ig',
  // institutions that would mislead as a personal page
  'parliament', 'senate', 'national-assembly', 'county-assembly', 'cabinet',
  'state-house', 'government', 'county-government', 'iebc', 'kenya',
  'dashboard', 'features', 'demo', 'logout', 'login', 'signup', 'change-email',
  'change-password', 'delete-account', 'forgot-password', 'reset-password',
  // kept for the platform's future use
  'security', 'privacy', 'terms', 'about', 'help', 'support', 'contact', 'contacts', 'contact-us', 'api',
  'blog', 'news', 'press', 'verify', 'settings', 'why-vote', 'data-policy', 'faq'
];

export const platformSettings = pgTable('platform_settings', {
  id: integer('id').primaryKey().default(1),
  // Shared by every OTP send (sms/whatsapp/email) and by re-inviting the same
  // (leader, role, email): seconds between sends, and max sends/24h.
  otpCooldownSeconds: integer('otp_cooldown_seconds').default(60).notNull(),
  otpDailyCap: integer('otp_daily_cap').default(3).notNull(),
  // Lifetime (not per-day) invite cap per campaign, by subscription tier — mass
  // mobilization (many unique invitees) is intentionally uncapped day-to-day;
  // this only bounds total invites ever sent, scaled to what they paid for.
  inviteLimits: jsonb('invite_limits')
    .$type<{ aspirant: number; influencer: number; mobilizer: number }>()
    .default({ aspirant: 10, influencer: 50, mobilizer: 200 })
    .notNull(),
  // Slugs no leader may take: the platform's own routes (a leader slug must never
  // shadow a top-level route or a /dashboard/<slug> second segment) plus words the
  // platform may want later. Numeric-only slugs (e.g. "2027") are always blocked in
  // code since ballot routes use bare years. Removing a route word here breaks the
  // shadowing guard for it — edit with care.
  blockedSlugs: jsonb('blocked_slugs').$type<string[]>().default(DEFAULT_BLOCKED_SLUGS).notNull(),
  // Rows per page on every paginated dashboard list (campaign posts/reviews/
  // followers/broadcasts/PR, admin tables, citizen invites).
  pageSize: integer('page_size').default(50).notNull(),
  // Checklist gate: how many email-verified managers a campaign needs on its
  // team, and how many of them must complete their own sign-off (role + national
  // ID + ID images), before the profile reads as "complete".
  requiredTeamManagers: integer('required_team_managers').default(2).notNull(),
  requiredSignoffs: integer('required_signoffs').default(1).notNull(),
  // Campaign verification gate: whether the admin's Verify-campaign action
  // requires the IEBC Certificate of Clearance to be uploaded first. Off by
  // default — certificates aren't issued until closer to the 2027 nominations,
  // so requiring one earlier would make every campaign unverifiable.
  requireIebcForVerification: boolean('require_iebc_for_verification').default(false).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 25. PASSWORD RESET REQUESTS (rate-limit tracking only — better-auth owns the
// actual reset token/link via emailAndPassword.sendResetPassword in auth.ts;
// this just records "a reset was requested for X at T" against the same
// cooldown/daily-cap settings used everywhere else, so the form can't be
// used to spam arbitrary inboxes with reset emails.)
export const passwordResetRequests = pgTable('password_reset_requests', {
  id: serial('id').primaryKey(),
  destination: varchar('destination', { length: 100 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('password_reset_requests_destination_idx').on(t.destination),
]);

// Better-auth generated tables (run: bun run auth:schema)
export * from './auth.schema';
