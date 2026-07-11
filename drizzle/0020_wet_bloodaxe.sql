ALTER TABLE "reviews" ALTER COLUMN "flag_reason" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."review_flag_reason";--> statement-breakpoint
CREATE TYPE "public"."review_flag_reason" AS ENUM('spam', 'insult', 'incitement', 'hate_speech', 'misinformation', 'other');--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "flag_reason" SET DATA TYPE "public"."review_flag_reason" USING "flag_reason"::"public"."review_flag_reason";