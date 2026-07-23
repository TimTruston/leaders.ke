ALTER TABLE "campaigns" ADD COLUMN "party_id" integer;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Backfill leaders.party_id (each person's most recent term) and campaigns.party_id
-- (each person's live main campaign) from party_memberships' current live row,
-- before the table is dropped below — preserves the scraped party affiliation data.
with live_party as (
	select subject_user_id, party_id
	from party_memberships
	where deleted_at is null and end_at is null
),
latest_term as (
	select distinct on (user_id) id, user_id
	from leaders
	where deleted_at is null
	order by user_id, start_at desc
)
update leaders l
set party_id = lp.party_id
from latest_term lt
join live_party lp on lp.subject_user_id = lt.user_id
where l.id = lt.id and l.party_id is null;--> statement-breakpoint
with live_party as (
	select subject_user_id, party_id
	from party_memberships
	where deleted_at is null and end_at is null
)
update campaigns c
set party_id = lp.party_id
from live_party lp
where c.subject_user_id = lp.subject_user_id
	and c.parent_campaign_id is null
	and c.deleted_at is null
	and c.party_id is null;--> statement-breakpoint
ALTER TABLE "party_memberships" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "party_memberships" CASCADE;
