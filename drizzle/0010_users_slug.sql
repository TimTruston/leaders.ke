ALTER TABLE "users" ADD COLUMN "slug" varchar(120);--> statement-breakpoint
CREATE UNIQUE INDEX "one_user_per_slug" ON "users" USING btree ("slug") WHERE "users"."deleted_at" is null;