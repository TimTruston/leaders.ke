ALTER TABLE "posts" ADD COLUMN "slug" varchar(160);--> statement-breakpoint
CREATE UNIQUE INDEX "one_post_per_slug" ON "posts" USING btree ("slug") WHERE "posts"."deleted_at" is null;