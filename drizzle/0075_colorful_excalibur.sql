ALTER TABLE "packages" ALTER COLUMN "tier" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "pricing" ALTER COLUMN "tier" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "tier" SET DATA TYPE text;--> statement-breakpoint
-- pricing-v2: remap the old tier names to the new ones before recreating the enum
-- (drizzle-kit's own generated cast would fail on existing 'aspirant'/'influencer'/
-- 'mobilizer' rows, since those values don't exist in the new enum).
UPDATE "packages" SET "tier" = CASE "tier" WHEN 'aspirant' THEN 'kickstart' WHEN 'influencer' THEN 'mobilize' WHEN 'mobilizer' THEN 'dominate' ELSE "tier" END;--> statement-breakpoint
UPDATE "pricing" SET "tier" = CASE "tier" WHEN 'aspirant' THEN 'kickstart' WHEN 'influencer' THEN 'mobilize' WHEN 'mobilizer' THEN 'dominate' ELSE "tier" END;--> statement-breakpoint
UPDATE "subscriptions" SET "tier" = CASE "tier" WHEN 'aspirant' THEN 'kickstart' WHEN 'influencer' THEN 'mobilize' WHEN 'mobilizer' THEN 'dominate' ELSE "tier" END;--> statement-breakpoint
UPDATE "platform_settings" SET "invite_limits" = jsonb_build_object('kickstart', ("invite_limits"->>'aspirant')::int, 'mobilize', ("invite_limits"->>'influencer')::int, 'dominate', ("invite_limits"->>'mobilizer')::int) WHERE "invite_limits" ? 'aspirant';--> statement-breakpoint
DROP TYPE "public"."subscription_tier";--> statement-breakpoint
CREATE TYPE "public"."subscription_tier" AS ENUM('kickstart', 'mobilize', 'dominate');--> statement-breakpoint
ALTER TABLE "packages" ALTER COLUMN "tier" SET DATA TYPE "public"."subscription_tier" USING "tier"::"public"."subscription_tier";--> statement-breakpoint
ALTER TABLE "pricing" ALTER COLUMN "tier" SET DATA TYPE "public"."subscription_tier" USING "tier"::"public"."subscription_tier";--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "tier" SET DATA TYPE "public"."subscription_tier" USING "tier"::"public"."subscription_tier";--> statement-breakpoint
DROP INDEX "one_package_per_band_tier";--> statement-breakpoint
DROP INDEX "one_current_rate";--> statement-breakpoint
ALTER TABLE "platform_settings" ALTER COLUMN "invite_limits" SET DEFAULT '{"kickstart":10,"mobilize":50,"dominate":200}'::jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "one_package_per_tier" ON "packages" USING btree ("tier");--> statement-breakpoint
CREATE UNIQUE INDEX "one_current_rate" ON "pricing" USING btree ("tier","billing_cycle") WHERE "pricing"."active_to" is null;--> statement-breakpoint
ALTER TABLE "packages" DROP COLUMN "band";--> statement-breakpoint
ALTER TABLE "pricing" DROP COLUMN "band";
