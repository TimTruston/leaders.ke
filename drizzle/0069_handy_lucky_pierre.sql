ALTER TABLE "deliveries" ALTER COLUMN "leader_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "experience_id" integer;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_experience_id_experience_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experience"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deliveries_experience_idx" ON "deliveries" USING btree ("experience_id");