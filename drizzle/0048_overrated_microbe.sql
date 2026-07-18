ALTER TABLE "invites" DROP CONSTRAINT "invites_leader_id_leaders_id_fk";
--> statement-breakpoint
ALTER TABLE "managers" DROP CONSTRAINT "managers_campaign_id_campaigns_id_fk";
--> statement-breakpoint
ALTER TABLE "profile_claims" DROP CONSTRAINT "profile_claims_leader_id_leaders_id_fk";
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_campaign_id_campaigns_id_fk";
--> statement-breakpoint
DROP INDEX "one_pending_claim_per_leader_per_user";--> statement-breakpoint
DROP INDEX "one_live_subscription_per_campaign";--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "subject_user_id" integer;--> statement-breakpoint
ALTER TABLE "profile_claims" ADD COLUMN "subject_user_id" integer;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "subject_user_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "photo_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "id_front_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "id_back_url" text;--> statement-breakpoint
UPDATE "invites" SET "subject_user_id" = "leaders"."user_id" FROM "leaders" WHERE "invites"."leader_id" = "leaders"."id";--> statement-breakpoint
UPDATE "profile_claims" SET "subject_user_id" = "leaders"."user_id" FROM "leaders" WHERE "profile_claims"."leader_id" = "leaders"."id";--> statement-breakpoint
UPDATE "subscriptions" SET "subject_user_id" = "leaders"."user_id" FROM "campaigns" JOIN "leaders" ON "campaigns"."leader_id" = "leaders"."id" WHERE "subscriptions"."campaign_id" = "campaigns"."id";--> statement-breakpoint
UPDATE "users" SET "photo_url" = sub."photo_url" FROM (SELECT DISTINCT ON ("user_id") "user_id", "photo_url" FROM "leaders" WHERE "photo_url" IS NOT NULL AND "deleted_at" IS NULL ORDER BY "user_id", "start_at" DESC) sub WHERE "users"."id" = sub."user_id";--> statement-breakpoint
UPDATE "users" SET "id_front_url" = sub."id_front_url", "id_back_url" = sub."id_back_url" FROM (SELECT DISTINCT ON ("user_id") "user_id", "id_front_url", "id_back_url" FROM "leaders" WHERE ("id_front_url" IS NOT NULL OR "id_back_url" IS NOT NULL) AND "deleted_at" IS NULL ORDER BY "user_id", "start_at" DESC) sub WHERE "users"."id" = sub."user_id";--> statement-breakpoint
UPDATE "users" SET "id_front_url" = COALESCE("users"."id_front_url", sub.front), "id_back_url" = COALESCE("users"."id_back_url", sub.back) FROM (SELECT DISTINCT ON ("user_id") "user_id", "roles"->>'idFrontUrl' AS front, "roles"->>'idBackUrl' AS back FROM "managers" WHERE ("roles"->>'idFrontUrl' IS NOT NULL OR "roles"->>'idBackUrl' IS NOT NULL) AND "deleted_at" IS NULL ORDER BY "user_id", "id" DESC) sub WHERE "users"."id" = sub."user_id";--> statement-breakpoint
UPDATE "managers" SET "roles" = "roles" - 'idFrontUrl' - 'idBackUrl' WHERE "roles" ? 'idFrontUrl' OR "roles" ? 'idBackUrl';--> statement-breakpoint
UPDATE "managers" SET "deleted_at" = now(), "is_active" = false WHERE "id" IN (SELECT "id" FROM (SELECT "id", row_number() OVER (PARTITION BY "user_id", "subject_user_id" ORDER BY "id" DESC) AS rn FROM "managers" WHERE "deleted_at" IS NULL) d WHERE d.rn > 1);--> statement-breakpoint
DELETE FROM "profile_claims" WHERE "outcome" IS NULL AND "id" IN (SELECT "id" FROM (SELECT "id", row_number() OVER (PARTITION BY "subject_user_id", "claimed_by" ORDER BY "id" DESC) AS rn FROM "profile_claims" WHERE "outcome" IS NULL) d WHERE d.rn > 1);--> statement-breakpoint
UPDATE "subscriptions" SET "status" = 'cancelled', "cancelled_at" = now() WHERE "status" IN ('active', 'pending') AND "id" IN (SELECT "id" FROM (SELECT "id", row_number() OVER (PARTITION BY "subject_user_id" ORDER BY "id" DESC) AS rn FROM "subscriptions" WHERE "status" IN ('active', 'pending')) d WHERE d.rn > 1);--> statement-breakpoint
ALTER TABLE "invites" ALTER COLUMN "subject_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_claims" ALTER COLUMN "subject_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "subject_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_claims" ADD CONSTRAINT "profile_claims_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_manager_per_person" ON "managers" USING btree ("user_id","subject_user_id") WHERE "managers"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "one_pending_claim_per_person_per_user" ON "profile_claims" USING btree ("subject_user_id","claimed_by") WHERE "profile_claims"."outcome" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "one_live_subscription_per_person" ON "subscriptions" USING btree ("subject_user_id") WHERE "subscriptions"."status" in ('active', 'pending');--> statement-breakpoint
ALTER TABLE "invites" DROP COLUMN "leader_id";--> statement-breakpoint
ALTER TABLE "leaders" DROP COLUMN "photo_url";--> statement-breakpoint
ALTER TABLE "leaders" DROP COLUMN "id_front_url";--> statement-breakpoint
ALTER TABLE "leaders" DROP COLUMN "id_back_url";--> statement-breakpoint
ALTER TABLE "managers" DROP COLUMN "campaign_id";--> statement-breakpoint
ALTER TABLE "profile_claims" DROP COLUMN "leader_id";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "campaign_id";
