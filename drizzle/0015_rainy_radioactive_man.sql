DROP INDEX "one_pledge_per_campaign";--> statement-breakpoint
ALTER TABLE "pledges" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pledges" ADD COLUMN "anon_id" varchar(32);--> statement-breakpoint
ALTER TABLE "pledges" ADD COLUMN "simulation_id" integer;--> statement-breakpoint
ALTER TABLE "pledges" ADD COLUMN "ip" varchar(45);--> statement-breakpoint
ALTER TABLE "pledges" ADD COLUMN "user_agent" varchar(255);--> statement-breakpoint
ALTER TABLE "pledges" ADD CONSTRAINT "pledges_simulation_id_ballot_simulations_id_fk" FOREIGN KEY ("simulation_id") REFERENCES "public"."ballot_simulations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_pledge_per_user_campaign" ON "pledges" USING btree ("campaign_id","user_id") WHERE "pledges"."deleted_at" is null and "pledges"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "one_pledge_per_anon_campaign" ON "pledges" USING btree ("campaign_id","anon_id") WHERE "pledges"."deleted_at" is null and "pledges"."anon_id" is not null;