CREATE TYPE "public"."experience_type" AS ENUM('education', 'professional', 'leadership');--> statement-breakpoint
CREATE TABLE "experience" (
	"id" serial PRIMARY KEY NOT NULL,
	"leader_id" integer NOT NULL,
	"type" "experience_type" NOT NULL,
	"position_id" integer,
	"title" varchar(255) NOT NULL,
	"institution" varchar(255) NOT NULL,
	"from" timestamp with time zone NOT NULL,
	"to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "address" varchar(200);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "socials" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "experience" ADD CONSTRAINT "experience_leader_id_leaders_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."leaders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience" ADD CONSTRAINT "experience_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "experience_leader_idx" ON "experience" USING btree ("leader_id");