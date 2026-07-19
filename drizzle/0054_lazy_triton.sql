-- Verification & the IEBC certificate move to the RUN (campaign): a candidacy is the
-- verifiable unit (aspirants have no leaders row). Deploy-safe: backfill from the
-- person's run before dropping the old leaders-scoped columns. On a wipe+reseed deploy
-- both are empty (seeded people are pre-verified, carry no cert), so backfills no-op.
ALTER TABLE "verifications" DROP CONSTRAINT "verifications_leader_id_leaders_id_fk";--> statement-breakpoint
DROP INDEX "one_pending_verification_per_leader";--> statement-breakpoint
ALTER TABLE "leaders" ALTER COLUMN "status" SET DEFAULT 'current';--> statement-breakpoint

-- IEBC cert -> the person's run campaign.
ALTER TABLE "campaigns" ADD COLUMN "iebc_certificate_url" text;--> statement-breakpoint
UPDATE "campaigns" c SET "iebc_certificate_url" = l."iebc_certificate_url"
FROM "leaders" l
WHERE c."subject_user_id" = l."user_id" AND l."iebc_certificate_url" IS NOT NULL
  AND c."parent_campaign_id" IS NULL AND c."deleted_at" IS NULL;--> statement-breakpoint

-- verifications.leader_id -> campaign_id (the person's run).
ALTER TABLE "verifications" ADD COLUMN "campaign_id" integer;--> statement-breakpoint
UPDATE "verifications" v SET "campaign_id" = (
  SELECT c."id" FROM "campaigns" c
  JOIN "leaders" l ON l."user_id" = c."subject_user_id"
  WHERE l."id" = v."leader_id" AND c."parent_campaign_id" IS NULL AND c."deleted_at" IS NULL
  ORDER BY c."cycle_year" DESC LIMIT 1
);--> statement-breakpoint
-- Drop verification rows that can't map to a run (their profile has no campaign) —
-- transient review artifacts, rebuilt from a fresh submission.
DELETE FROM "verifications" WHERE "campaign_id" IS NULL;--> statement-breakpoint
ALTER TABLE "verifications" ALTER COLUMN "campaign_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_pending_verification_per_campaign" ON "verifications" USING btree ("campaign_id") WHERE "verifications"."outcome" is null;--> statement-breakpoint

ALTER TABLE "leaders" DROP COLUMN "iebc_certificate_url";--> statement-breakpoint
ALTER TABLE "verifications" DROP COLUMN "leader_id";
