ALTER TABLE "pledges" RENAME COLUMN "phone" TO "whatsapp";--> statement-breakpoint
ALTER TABLE "pledges" ADD COLUMN "email" varchar(100);