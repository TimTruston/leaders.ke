ALTER TABLE "donations" DROP CONSTRAINT "donations_leader_id_leaders_id_fk";
--> statement-breakpoint
DROP INDEX "donations_leader_idx";--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "position_id" integer;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "cycle_year" integer;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "fundraising_goal" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "donations" ADD COLUMN "campaign_id" integer;--> statement-breakpoint
UPDATE "campaigns" SET "position_id" = "leaders"."position_id", "cycle_year" = EXTRACT(YEAR FROM "leaders"."start_at")::int, "fundraising_goal" = "leaders"."fundraising_goal" FROM "leaders" WHERE "campaigns"."leader_id" = "leaders"."id";--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "position_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "cycle_year" SET NOT NULL;--> statement-breakpoint
INSERT INTO "campaigns" ("creator_id", "leader_id", "position_id", "cycle_year", "title", "description", "fundraising_goal")
SELECT DISTINCT ON ("leaders"."id") "leaders"."user_id", "leaders"."id", "leaders"."position_id", EXTRACT(YEAR FROM "leaders"."start_at")::int, 'Campaign', 'Campaign for office.', "leaders"."fundraising_goal"
FROM "donations" JOIN "leaders" ON "donations"."leader_id" = "leaders"."id"
WHERE NOT EXISTS (SELECT 1 FROM "campaigns" c WHERE c."leader_id" = "leaders"."id" AND c."parent_campaign_id" IS NULL AND c."deleted_at" IS NULL);--> statement-breakpoint
UPDATE "donations" SET "campaign_id" = sub."cid" FROM (SELECT DISTINCT ON ("leader_id") "leader_id", "id" AS cid FROM "campaigns" WHERE "parent_campaign_id" IS NULL AND "deleted_at" IS NULL ORDER BY "leader_id", "id") sub WHERE "donations"."leader_id" = sub."leader_id";--> statement-breakpoint
ALTER TABLE "donations" ALTER COLUMN "campaign_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "donations_campaign_idx" ON "donations" USING btree ("campaign_id","status");--> statement-breakpoint
ALTER TABLE "donations" DROP COLUMN "leader_id";--> statement-breakpoint
ALTER TABLE "leaders" DROP COLUMN "fundraising_goal";
