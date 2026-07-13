ALTER TABLE "users" DROP COLUMN "verified_at";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "verified_at" jsonb DEFAULT '{}'::jsonb NOT NULL;
