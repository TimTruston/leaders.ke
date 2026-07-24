ALTER TABLE "followers" ADD COLUMN "confirm_code_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "followers" ADD COLUMN "confirm_code_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "followers" ADD COLUMN "confirm_attempts" integer DEFAULT 0 NOT NULL;