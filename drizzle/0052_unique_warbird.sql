-- Experience (education/professional history) belongs to the PERSON, not a leaders
-- term, so it follows someone across every candidacy and shows even for an aspirant
-- with no leaders row. Deploy-safe: add nullable -> backfill from the term's user ->
-- NOT NULL -> swap index/FK -> drop leader_id. Also add campaigns.verified_at (a run
-- is verified independently of any held term).
ALTER TABLE "campaigns" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "experience" ADD COLUMN "subject_user_id" integer;--> statement-breakpoint
UPDATE "experience" SET "subject_user_id" = "leaders"."user_id" FROM "leaders" WHERE "experience"."leader_id" = "leaders"."id";--> statement-breakpoint
ALTER TABLE "experience" ALTER COLUMN "subject_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "experience" ADD CONSTRAINT "experience_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "experience_subject_idx" ON "experience" USING btree ("subject_user_id");--> statement-breakpoint
DROP INDEX "experience_leader_idx";--> statement-breakpoint
ALTER TABLE "experience" DROP CONSTRAINT "experience_leader_id_leaders_id_fk";--> statement-breakpoint
ALTER TABLE "experience" DROP COLUMN "leader_id";
