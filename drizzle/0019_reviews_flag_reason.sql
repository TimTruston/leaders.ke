CREATE TYPE "public"."review_flag_reason" AS ENUM('spam', 'insults', 'incitement', 'hate_speech', 'misinformation', 'other');--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "flag_reason" "review_flag_reason";--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "flagged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reviews" DROP COLUMN "approved_at";
