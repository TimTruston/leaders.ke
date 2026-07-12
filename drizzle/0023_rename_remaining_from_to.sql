-- Custom SQL migration file, put your code below! -----
-- Same dev-database-only drift as 0021 — see that file's comment. Guarded so
-- this is a no-op on a fresh/clean database.
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'alliance_memberships' AND column_name = 'from') THEN
		ALTER TABLE "alliance_memberships" RENAME COLUMN "from" TO "start_at";
	END IF;
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'alliance_memberships' AND column_name = 'to') THEN
		ALTER TABLE "alliance_memberships" RENAME COLUMN "to" TO "end_at";
	END IF;
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'party_memberships' AND column_name = 'from') THEN
		ALTER TABLE "party_memberships" RENAME COLUMN "from" TO "start_at";
	END IF;
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'party_memberships' AND column_name = 'to') THEN
		ALTER TABLE "party_memberships" RENAME COLUMN "to" TO "end_at";
	END IF;
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'from') THEN
		ALTER TABLE "events" RENAME COLUMN "from" TO "start_at";
	END IF;
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'to') THEN
		ALTER TABLE "events" RENAME COLUMN "to" TO "end_at";
	END IF;
END $$;
