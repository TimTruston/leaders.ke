-- Pillars now belong directly to campaigns (not a manifestos wrapper).
-- Data migration: give each manifesto's leader a main campaign (creating one
-- if needed), point existing pillars at it, then drop manifestos entirely.

-- 1. Ensure every leader with a manifesto has a main campaign.
INSERT INTO campaigns (creator_id, leader_id, title, description)
SELECT DISTINCT l.user_id, m.leader_id,
  u.first_name || ' ' || u.other_names || '''s Campaign',
  u.first_name || ' ' || u.other_names || '''s campaign for office.'
FROM manifestos m
JOIN leaders l ON l.id = m.leader_id
JOIN users u ON u.id = l.user_id
WHERE NOT EXISTS (
  SELECT 1 FROM campaigns c
  WHERE c.leader_id = m.leader_id AND c.parent_campaign_id IS NULL AND c.deleted_at IS NULL
);
--> statement-breakpoint

-- 2. Add the new column, backfill from the manifesto -> leader -> main campaign chain.
ALTER TABLE "pillars" ADD COLUMN "campaign_id" integer;
--> statement-breakpoint

UPDATE pillars p
SET campaign_id = c.id
FROM manifestos m
JOIN campaigns c ON c.leader_id = m.leader_id AND c.parent_campaign_id IS NULL AND c.deleted_at IS NULL
WHERE p.manifesto_id = m.id;
--> statement-breakpoint

-- 3. Enforce, index, and cut over the foreign key.
ALTER TABLE "pillars" ALTER COLUMN "campaign_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "pillars" ADD CONSTRAINT "pillars_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "pillars" DROP CONSTRAINT "pillars_manifesto_id_manifestos_id_fk";
--> statement-breakpoint
ALTER TABLE "pillars" DROP COLUMN "manifesto_id";
--> statement-breakpoint

-- 4. Drop the now-unused leaders.manifesto_id pointer and the manifestos table.
ALTER TABLE "leaders" DROP COLUMN IF EXISTS "manifesto_id";
--> statement-breakpoint
DROP TABLE "manifestos";
