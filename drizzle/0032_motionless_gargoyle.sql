ALTER TABLE "otps" ADD COLUMN "link_token" varchar(32);--> statement-breakpoint
CREATE INDEX "otps_link_token_idx" ON "otps" USING btree ("link_token");