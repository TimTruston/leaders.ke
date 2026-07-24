-- pricing-v2: pricing/packages are pure rate-card config fully replaced by the new
-- flat-per-tier model (see src/lib/data/packages.json + `bun run db:seed -- --packages`),
-- so their old per-band rows are cleared rather than remapped — remapping them would
-- collide 3-to-1 on the new tier-only unique indexes below (national/regional/ward
-- rows for the same tier). subscriptions.tier and platform_settings.invite_limits DO
-- hold real data, so those are remapped in place instead of cleared.
DELETE FROM "packages";--> statement-breakpoint
DELETE FROM "pricing";--> statement-breakpoint
ALTER TABLE "packages" ALTER COLUMN "tier" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "pricing" ALTER COLUMN "tier" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "tier" SET DATA TYPE text;--> statement-breakpoint
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
