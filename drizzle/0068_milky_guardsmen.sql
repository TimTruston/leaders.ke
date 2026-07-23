CREATE TABLE "deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"leader_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_leader_id_leaders_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."leaders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deliveries_leader_idx" ON "deliveries" USING btree ("leader_id");