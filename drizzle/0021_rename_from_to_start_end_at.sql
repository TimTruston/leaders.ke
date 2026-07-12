-- Custom SQL migration file, put your code below! -----
ALTER TABLE "leaders" RENAME COLUMN "from" TO "start_at";--> statement-breakpoint
ALTER TABLE "leaders" RENAME COLUMN "to" TO "end_at";--> statement-breakpoint
ALTER TABLE "experience" RENAME COLUMN "from" TO "start_at";--> statement-breakpoint
ALTER TABLE "experience" RENAME COLUMN "to" TO "end_at";
