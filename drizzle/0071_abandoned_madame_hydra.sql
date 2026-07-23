ALTER TABLE "users" ADD COLUMN "verification_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profile_verified_at" timestamp with time zone;--> statement-breakpoint
-- Backfill from each person's ACTIVE_CYCLE main campaign (parentCampaignId null,
-- not deleted) before the column is dropped below — preserves in-flight
-- submissions and already-approved applications across the decoupling.
UPDATE users u
SET verification_requested_at = c.verification_requested_at,
    profile_verified_at = c.verified_at
FROM campaigns c
WHERE c.subject_user_id = u.id
  AND c.parent_campaign_id IS NULL
  AND c.deleted_at IS NULL
  AND (c.verification_requested_at IS NOT NULL OR c.verified_at IS NOT NULL);--> statement-breakpoint
ALTER TABLE "campaigns" DROP COLUMN "verification_requested_at";