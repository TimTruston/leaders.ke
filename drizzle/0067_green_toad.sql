ALTER TABLE "users" DROP CONSTRAINT "users_pending_current_position_id_positions_id_fk";
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_pending_current_party_id_parties_id_fk";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "pending_current_position_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "pending_current_party_id";