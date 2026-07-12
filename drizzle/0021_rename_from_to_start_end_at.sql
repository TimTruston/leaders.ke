-- Custom SQL migration file, put your code below! -----
-- Dev-database-only drift: those tables' live columns were still named "from"/
-- "to" from before schema.ts moved to start_at/end_at, even though migration
-- 0000 here already creates them with the correct names for anyone replaying
-- from scratch. Guarded so this is a no-op on a fresh/clean database.
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leaders' AND column_name = 'from') THEN
		ALTER TABLE "leaders" RENAME COLUMN "from" TO "start_at";
	END IF;
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leaders' AND column_name = 'to') THEN
		ALTER TABLE "leaders" RENAME COLUMN "to" TO "end_at";
	END IF;
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'experience' AND column_name = 'from') THEN
		ALTER TABLE "experience" RENAME COLUMN "from" TO "start_at";
	END IF;
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'experience' AND column_name = 'to') THEN
		ALTER TABLE "experience" RENAME COLUMN "to" TO "end_at";
	END IF;
END $$;
