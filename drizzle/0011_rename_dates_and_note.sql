-- Renames startAt/endAt -> from/to on leaders, events, party_memberships and
-- alliance_memberships (subscriptions keeps startAt/endsAt — different semantic,
-- not touched). Also renames leaders.note -> leaders.description.
ALTER TABLE "leaders" RENAME COLUMN "start_at" TO "from";
--> statement-breakpoint
ALTER TABLE "leaders" RENAME COLUMN "end_at" TO "to";
--> statement-breakpoint
ALTER TABLE "leaders" RENAME COLUMN "note" TO "description";
--> statement-breakpoint
ALTER TABLE "events" RENAME COLUMN "start_at" TO "from";
--> statement-breakpoint
ALTER TABLE "events" RENAME COLUMN "end_at" TO "to";
--> statement-breakpoint
ALTER TABLE "party_memberships" RENAME COLUMN "start_at" TO "from";
--> statement-breakpoint
ALTER TABLE "party_memberships" RENAME COLUMN "end_at" TO "to";
--> statement-breakpoint
ALTER TABLE "alliance_memberships" RENAME COLUMN "start_at" TO "from";
--> statement-breakpoint
ALTER TABLE "alliance_memberships" RENAME COLUMN "end_at" TO "to";
