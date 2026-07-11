ALTER TABLE "reviews" ADD COLUMN "subject_id" integer;--> statement-breakpoint
UPDATE "reviews" SET "subject_id" = "leaders"."user_id" FROM "leaders" WHERE "leaders"."id" = "reviews"."leader_id";--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "subject_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_leader_id_leaders_id_fk";--> statement-breakpoint
DROP INDEX "reviews_leader_idx";--> statement-breakpoint
ALTER TABLE "reviews" DROP COLUMN "leader_id";--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_subject_id_users_id_fk" FOREIGN KEY ("subject_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reviews_subject_idx" ON "reviews" USING btree ("subject_id");
