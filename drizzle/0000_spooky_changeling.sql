CREATE TYPE "public"."billing_cycle" AS ENUM('monthly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."chat_channel" AS ENUM('web', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."chat_sender" AS ENUM('follower', 'ai', 'leader', 'manager', 'ambassador');--> statement-breakpoint
CREATE TYPE "public"."chat_target" AS ENUM('leader', 'manager', 'ambassador');--> statement-breakpoint
CREATE TYPE "public"."comment_creator_type" AS ENUM('citizen', 'leaders', 'manager', 'ambassador');--> statement-breakpoint
CREATE TYPE "public"."contact_channel" AS ENUM('sms', 'whatsapp', 'email');--> statement-breakpoint
CREATE TYPE "public"."credit_txn_kind" AS ENUM('topup', 'spend', 'refund', 'bonus');--> statement-breakpoint
CREATE TYPE "public"."digest" AS ENUM('platform', 'position', 'leader', 'campaign');--> statement-breakpoint
CREATE TYPE "public"."otp_channel" AS ENUM('sms', 'whatsapp', 'email');--> statement-breakpoint
CREATE TYPE "public"."payment_purpose" AS ENUM('subscription', 'credits', 'feature', 'donation');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'success', 'failed', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."price_band" AS ENUM('national', 'regional', 'ward');--> statement-breakpoint
CREATE TYPE "public"."subscription_origin" AS ENUM('new', 'renewal', 'upgrade', 'downgrade');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('pending', 'active', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."subscription_tier" AS ENUM('aspirant', 'influencer', 'mobilizer');--> statement-breakpoint
CREATE TABLE "alliance_memberships" (
	"id" serial PRIMARY KEY NOT NULL,
	"alliance_id" integer NOT NULL,
	"leader_id" integer NOT NULL,
	"role" varchar(100) NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "alliances" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ambassadors" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"leader_id" integer NOT NULL,
	"manager_id" integer,
	"campaign_id" integer,
	"roles" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "banned" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"reason" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"creator_id" integer NOT NULL,
	"leader_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"faq" jsonb DEFAULT '[]'::jsonb,
	"parent_campaign_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"creator_id" integer,
	"creator_type" "comment_creator_type" NOT NULL,
	"post_id" integer,
	"issue_id" integer,
	"parent_comment_id" integer,
	"message" varchar(255) NOT NULL,
	"votes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"channel" "contact_channel" NOT NULL,
	"value" varchar(100) NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"scope" "digest" NOT NULL,
	"scope_id" integer,
	"channel" "chat_channel" NOT NULL,
	"user_id" integer,
	"follower_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_id" integer NOT NULL,
	"kind" "credit_txn_kind" NOT NULL,
	"amount" integer NOT NULL,
	"channel" varchar(20),
	"payment_id" integer,
	"reference" varchar(100),
	"balance_after" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"fingerprint" varchar(255) NOT NULL,
	"user_agent" text,
	"ip_address" varchar(45),
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"creator_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"agenda" text NOT NULL,
	"venue" varchar(255) NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"attendants" jsonb DEFAULT '["public"]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "featured" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"summary" varchar(255) NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" serial PRIMARY KEY NOT NULL,
	"creator_id" integer NOT NULL,
	"campaign_id" integer,
	"leader_id" integer,
	"url" text NOT NULL,
	"mime_type" varchar(50) NOT NULL,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "followers" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"digest" "digest" NOT NULL,
	"digest_id" integer,
	"email" boolean DEFAULT false NOT NULL,
	"sms" boolean DEFAULT false NOT NULL,
	"whatsapp" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"creator_id" integer NOT NULL,
	"position_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"votes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "leaders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"position_id" integer NOT NULL,
	"manifesto_id" integer,
	"faq" jsonb DEFAULT '[]'::jsonb,
	"contacts" jsonb DEFAULT '{}'::jsonb,
	"status" varchar(30) DEFAULT 'aspirant' NOT NULL,
	"verified_at" timestamp with time zone,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "managers" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"leader_id" integer NOT NULL,
	"campaign_id" integer,
	"roles" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"verified_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "manifestos" (
	"id" serial PRIMARY KEY NOT NULL,
	"leader_id" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"sender" "chat_sender" NOT NULL,
	"sender_id" integer,
	"target" "chat_target",
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parties" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"logo_url" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "party_memberships" (
	"id" serial PRIMARY KEY NOT NULL,
	"party_id" integer NOT NULL,
	"leader_id" integer NOT NULL,
	"role" varchar(100) NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"payer_id" integer NOT NULL,
	"campaign_id" integer,
	"purpose" "payment_purpose" NOT NULL,
	"subscription_id" integer,
	"amount" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'KES' NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"method" varchar(30) NOT NULL,
	"provider_reference" varchar(100),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_provider_reference_unique" UNIQUE("provider_reference")
);
--> statement-breakpoint
CREATE TABLE "pillars" (
	"id" serial PRIMARY KEY NOT NULL,
	"manifesto_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"region" varchar(100) NOT NULL,
	"boundary" varchar(50) NOT NULL,
	"title" varchar(100) NOT NULL,
	"band" "price_band" NOT NULL,
	"is_elected" boolean DEFAULT true NOT NULL,
	"current_leader_id" integer,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"creator_id" integer,
	"leader_id" integer,
	"campaign_id" integer,
	"title" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"ai_summary" text,
	"manual_summary" text,
	"medium" varchar(50) NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"public" boolean DEFAULT false NOT NULL,
	"votes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pricing" (
	"id" serial PRIMARY KEY NOT NULL,
	"band" "price_band" NOT NULL,
	"tier" "subscription_tier" NOT NULL,
	"billing_cycle" "billing_cycle" NOT NULL,
	"amount" integer NOT NULL,
	"active_from" timestamp with time zone DEFAULT now() NOT NULL,
	"active_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"payer_id" integer NOT NULL,
	"tier" "subscription_tier" NOT NULL,
	"billing_cycle" "billing_cycle" NOT NULL,
	"amount" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'KES' NOT NULL,
	"paid_at" timestamp with time zone,
	"status" "subscription_status" DEFAULT 'pending' NOT NULL,
	"origin" "subscription_origin" DEFAULT 'new' NOT NULL,
	"previous_subscription_id" integer,
	"start_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"auto_renew" boolean DEFAULT false NOT NULL,
	"payment_method" varchar(30),
	"payment_reference" varchar(100),
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_payment_reference_unique" UNIQUE("payment_reference")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"creator_id" integer,
	"post_id" integer NOT NULL,
	"leader_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"auth_user_id" text NOT NULL,
	"first_name" varchar(50) NOT NULL,
	"last_name" varchar(50) NOT NULL,
	"bio" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_auth_user_id_unique" UNIQUE("auth_user_id")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"channel" "otp_channel" NOT NULL,
	"destination" varchar(100) NOT NULL,
	"code_hash" varchar(255) NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_campaign_id_unique" UNIQUE("campaign_id")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alliance_memberships" ADD CONSTRAINT "alliance_memberships_alliance_id_alliances_id_fk" FOREIGN KEY ("alliance_id") REFERENCES "public"."alliances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alliance_memberships" ADD CONSTRAINT "alliance_memberships_leader_id_leaders_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."leaders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambassadors" ADD CONSTRAINT "ambassadors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambassadors" ADD CONSTRAINT "ambassadors_leader_id_leaders_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."leaders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambassadors" ADD CONSTRAINT "ambassadors_manager_id_managers_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."managers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambassadors" ADD CONSTRAINT "ambassadors_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "banned" ADD CONSTRAINT "banned_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_leader_id_leaders_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."leaders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_parent_campaign_id_campaigns_id_fk" FOREIGN KEY ("parent_campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_comment_id_comments_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_follower_id_followers_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."followers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "featured" ADD CONSTRAINT "featured_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_leader_id_leaders_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."leaders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followers" ADD CONSTRAINT "followers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaders" ADD CONSTRAINT "leaders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaders" ADD CONSTRAINT "leaders_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managers" ADD CONSTRAINT "managers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managers" ADD CONSTRAINT "managers_leader_id_leaders_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."leaders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managers" ADD CONSTRAINT "managers_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manifestos" ADD CONSTRAINT "manifestos_leader_id_leaders_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."leaders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_memberships" ADD CONSTRAINT "party_memberships_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_memberships" ADD CONSTRAINT "party_memberships_leader_id_leaders_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."leaders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payer_id_users_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pillars" ADD CONSTRAINT "pillars_manifesto_id_manifestos_id_fk" FOREIGN KEY ("manifesto_id") REFERENCES "public"."manifestos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_leader_id_leaders_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."leaders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_payer_id_users_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_previous_subscription_id_subscriptions_id_fk" FOREIGN KEY ("previous_subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_leader_id_leaders_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."leaders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_auth_user_id_user_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_main_campaign_per_leader" ON "campaigns" USING btree ("leader_id") WHERE "campaigns"."parent_campaign_id" is null and "campaigns"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "one_value_per_channel" ON "contacts" USING btree ("channel","value") WHERE "contacts"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "contacts_user_idx" ON "contacts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conversations_scope_idx" ON "conversations" USING btree ("scope","scope_id");--> statement-breakpoint
CREATE INDEX "credit_txn_wallet_idx" ON "credit_transactions" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "devices_fingerprint_idx" ON "devices" USING btree ("fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "one_device_per_user" ON "devices" USING btree ("user_id","fingerprint");--> statement-breakpoint
CREATE INDEX "files_leader_idx" ON "files" USING btree ("leader_id");--> statement-breakpoint
CREATE INDEX "files_campaign_idx" ON "files" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_follow_per_target" ON "followers" USING btree ("user_id","digest",coalesce("digest_id", 0)) WHERE "followers"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "one_current_per_position" ON "leaders" USING btree ("position_id") WHERE "leaders"."status" = 'current' and "leaders"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_current_rate" ON "pricing" USING btree ("band","tier","billing_cycle") WHERE "pricing"."active_to" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "one_live_subscription_per_campaign" ON "subscriptions" USING btree ("campaign_id") WHERE "subscriptions"."status" in ('active', 'pending');--> statement-breakpoint
CREATE INDEX "verifications_destination_idx" ON "verifications" USING btree ("destination");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");