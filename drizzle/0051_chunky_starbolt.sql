-- Campaigns become person-anchored: a run belongs to a person, not a leaders term.
-- leader_id relaxes to nullable (set only when a run is tied to a held term); a new
-- subject_user_id names the person, and the "one main campaign" rule re-keys to
-- (person, cycle). Deploy-safe: add nullable -> backfill -> NOT NULL -> dedupe -> index.
DROP INDEX "one_main_campaign_per_leader";--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "leader_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "subject_user_id" integer;--> statement-breakpoint
-- Every existing campaign has a leader_id (was NOT NULL); anchor it to that term's person.
UPDATE "campaigns" SET "subject_user_id" = "leaders"."user_id" FROM "leaders" WHERE "campaigns"."leader_id" = "leaders"."id";--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "subject_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Pre-dedupe before the new unique index: keep the earliest live main campaign per
-- (person, cycle), soft-delete any others so the partial unique index can be built.
UPDATE "campaigns" SET "deleted_at" = now() WHERE "id" IN (
  SELECT c."id" FROM "campaigns" c
  JOIN (
    SELECT "subject_user_id" AS person, "cycle_year" AS cyc, min("id") AS keep
    FROM "campaigns"
    WHERE "parent_campaign_id" IS NULL AND "deleted_at" IS NULL
    GROUP BY "subject_user_id", "cycle_year" HAVING count(*) > 1
  ) d ON d.person = c."subject_user_id" AND d.cyc = c."cycle_year" AND c."id" <> d.keep
  WHERE c."parent_campaign_id" IS NULL AND c."deleted_at" IS NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "one_main_campaign_per_person_cycle" ON "campaigns" USING btree ("subject_user_id","cycle_year") WHERE "campaigns"."parent_campaign_id" is null and "campaigns"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "campaigns_leader_idx" ON "campaigns" USING btree ("leader_id");
