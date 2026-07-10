ALTER TABLE "followers" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "followers" ADD COLUMN "name" varchar(100);--> statement-breakpoint
ALTER TABLE "followers" ADD COLUMN "phone_number" varchar(20);--> statement-breakpoint
ALTER TABLE "followers" ADD COLUMN "email_address" varchar(100);--> statement-breakpoint
ALTER TABLE "followers" ADD COLUMN "county" varchar(50);--> statement-breakpoint
ALTER TABLE "followers" ADD COLUMN "constituency" varchar(50);--> statement-breakpoint
ALTER TABLE "followers" ADD COLUMN "ward" varchar(50);--> statement-breakpoint
CREATE INDEX "followers_target_idx" ON "followers" USING btree ("digest","digest_id");