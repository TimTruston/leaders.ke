ALTER TABLE "users" DROP COLUMN "verification_email_sent_at";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "verified_at";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "verified" jsonb DEFAULT '{"email":false,"sms":false,"whatsapp":false}'::jsonb NOT NULL;