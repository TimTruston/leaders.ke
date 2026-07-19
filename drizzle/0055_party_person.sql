-- Party membership moves to the PERSON: it is a dated timeline (people switch
-- parties across cycles) that must survive term changes and exist for aspirants
-- with no leaders row. Deploy-safe: add nullable -> backfill from the term's user
-- -> NOT NULL -> dedupe live rows -> swap FK/index -> drop leader_id.
ALTER TABLE "party_memberships" ADD COLUMN "subject_user_id" integer;--> statement-breakpoint
UPDATE "party_memberships" SET "subject_user_id" = "leaders"."user_id" FROM "leaders" WHERE "party_memberships"."leader_id" = "leaders"."id";--> statement-breakpoint
ALTER TABLE "party_memberships" ALTER COLUMN "subject_user_id" SET NOT NULL;--> statement-breakpoint
-- One live membership per person: a person with several terms could carry one live
-- row per term. Keep the newest-started live row, end the rest (history preserved).
UPDATE "party_memberships" SET "end_at" = now() WHERE "id" IN (
  SELECT pm."id" FROM "party_memberships" pm
  JOIN (
    SELECT "subject_user_id" AS person, max("start_at") AS latest
    FROM "party_memberships"
    WHERE "end_at" IS NULL AND "deleted_at" IS NULL
    GROUP BY "subject_user_id" HAVING count(*) > 1
  ) d ON d.person = pm."subject_user_id" AND pm."start_at" < d.latest
  WHERE pm."end_at" IS NULL AND pm."deleted_at" IS NULL
);--> statement-breakpoint
ALTER TABLE "party_memberships" ADD CONSTRAINT "party_memberships_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "party_memberships_subject_idx" ON "party_memberships" USING btree ("subject_user_id");--> statement-breakpoint
ALTER TABLE "party_memberships" DROP CONSTRAINT "party_memberships_leader_id_leaders_id_fk";--> statement-breakpoint
ALTER TABLE "party_memberships" DROP COLUMN "leader_id";
