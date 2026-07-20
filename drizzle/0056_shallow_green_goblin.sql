DROP INDEX "one_pending_claim_per_person_per_user";--> statement-breakpoint
ALTER TABLE "profile_claims" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "one_pending_claim_per_person_per_user" ON "profile_claims" USING btree ("subject_user_id","claimed_by") WHERE "profile_claims"."outcome" is null and "profile_claims"."deleted_at" is null;