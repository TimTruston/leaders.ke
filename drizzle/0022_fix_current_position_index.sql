-- Custom SQL migration file, put your code below! -----
-- Fixes a dev-database-only drift: that DB's live index was still named
-- "one_incumbent_per_position" from before schema.ts moved to the 'current'
-- status value, even though migration 0000 here already creates the correctly-
-- named "one_current_per_position" for anyone replaying from scratch. Both
-- statements are guarded so this is a no-op on a fresh/clean database.
DROP INDEX IF EXISTS "one_incumbent_per_position";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "one_current_per_position" ON "leaders" USING btree ("position_id") WHERE "leaders"."status" = 'current' and "leaders"."deleted_at" is null;
