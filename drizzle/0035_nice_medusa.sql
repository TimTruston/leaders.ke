CREATE TABLE "platform_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"otp_cooldown_seconds" integer DEFAULT 60 NOT NULL,
	"otp_daily_cap" integer DEFAULT 3 NOT NULL,
	"invite_limits" jsonb DEFAULT '{"aspirant":10,"influencer":50,"mobilizer":200}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "verified" SET DEFAULT '{"email":false,"sms":false,"whatsapp":false}'::jsonb;