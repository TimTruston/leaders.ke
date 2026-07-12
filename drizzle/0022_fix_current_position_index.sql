-- Custom SQL migration file, put your code below! -----
-- Live index/data used the old status value 'incumbent'; schema.ts has used
-- 'current' for a while (all live rows already say 'current' or 'aspirant'
-- or 'former' - none say 'incumbent'), but the unique index itself was never
-- migrated, so it was silently guarding a status value nothing uses.
DROP INDEX "one_incumbent_per_position";--> statement-breakpoint
CREATE UNIQUE INDEX "one_current_per_position" ON "leaders" USING btree ("position_id") WHERE "leaders"."status" = 'current' and "leaders"."deleted_at" is null;
