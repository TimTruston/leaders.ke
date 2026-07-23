ALTER TABLE "users" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "managers" DROP COLUMN "verified_at";