CREATE TYPE "public"."claim_outcome" AS ENUM('approved', 'rejected');--> statement-breakpoint
CREATE TABLE "profile_claims" (
	"id" serial PRIMARY KEY NOT NULL,
	"leader_id" integer NOT NULL,
	"claimed_by" integer NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone,
	"outcome" "claim_outcome",
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "profile_claims" ADD CONSTRAINT "profile_claims_leader_id_leaders_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."leaders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_claims" ADD CONSTRAINT "profile_claims_claimed_by_users_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_claims" ADD CONSTRAINT "profile_claims_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_pending_claim_per_leader_per_user" ON "profile_claims" USING btree ("leader_id","claimed_by") WHERE "profile_claims"."outcome" is null;