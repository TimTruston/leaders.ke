-- Custom SQL migration file, put your code below! -----
ALTER TABLE "alliance_memberships" RENAME COLUMN "from" TO "start_at";--> statement-breakpoint
ALTER TABLE "alliance_memberships" RENAME COLUMN "to" TO "end_at";--> statement-breakpoint
ALTER TABLE "party_memberships" RENAME COLUMN "from" TO "start_at";--> statement-breakpoint
ALTER TABLE "party_memberships" RENAME COLUMN "to" TO "end_at";--> statement-breakpoint
ALTER TABLE "events" RENAME COLUMN "from" TO "start_at";--> statement-breakpoint
ALTER TABLE "events" RENAME COLUMN "to" TO "end_at";
