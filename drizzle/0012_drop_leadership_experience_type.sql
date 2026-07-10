ALTER TABLE "experience" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."experience_type";--> statement-breakpoint
CREATE TYPE "public"."experience_type" AS ENUM('education', 'professional');--> statement-breakpoint
ALTER TABLE "experience" ALTER COLUMN "type" SET DATA TYPE "public"."experience_type" USING "type"::"public"."experience_type";