-- The aspirant flip (deploy path). Aspirants are RUNS, not held office, so any
-- existing status='aspirant' leaders row becomes a verified campaign and the row is
-- deleted. On a wipe+reseed deploy this finds nothing to convert (the seeders no
-- longer emit aspirant rows); on an in-place deploy it migrates real data. Experience
-- is already person-scoped (0052), so it survives the row deletion.

-- 1. A campaign already tied to an aspirant row IS that run: detach it from the row
--    (leaders row is about to go) and carry the row's verified state onto it.
UPDATE "campaigns" SET
  "verified_at" = COALESCE("campaigns"."verified_at", "leaders"."verified_at"),
  "leader_id" = NULL
FROM "leaders"
WHERE "campaigns"."leader_id" = "leaders"."id" AND "leaders"."status" = 'aspirant';--> statement-breakpoint

-- 2. Create a run for every aspirant row that doesn't already have one (person, cycle).
INSERT INTO "campaigns" ("creator_id", "subject_user_id", "leader_id", "position_id", "cycle_year", "verified_at", "title", "description", "created_at", "updated_at")
SELECT l."user_id", l."user_id", NULL, l."position_id", EXTRACT(YEAR FROM l."start_at")::int, l."verified_at",
       u."first_name" || ' ' || u."other_names" || '''s Campaign',
       u."first_name" || ' ' || u."other_names" || '''s campaign for office.',
       now(), now()
FROM "leaders" l
JOIN "users" u ON u."id" = l."user_id"
WHERE l."status" = 'aspirant' AND l."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "campaigns" c
    WHERE c."subject_user_id" = l."user_id"
      AND c."cycle_year" = EXTRACT(YEAR FROM l."start_at")::int
      AND c."parent_campaign_id" IS NULL AND c."deleted_at" IS NULL
  );--> statement-breakpoint

-- 3. Drop the aspirant leaders rows (party memberships/ambassadors on them cascade away;
--    experience is person-scoped and untouched).
DELETE FROM "leaders" WHERE "status" = 'aspirant';
