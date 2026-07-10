CREATE TYPE "public"."delivery_status" AS ENUM('promised', 'in_progress', 'delivered');--> statement-breakpoint
CREATE TYPE "public"."donation_status" AS ENUM('pending', 'confirmed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."endorsement_kind" AS ENUM('endorsement', 'testimonial', 'pledge');--> statement-breakpoint
CREATE TABLE "donations" (
	"id" serial PRIMARY KEY NOT NULL,
	"leader_id" integer NOT NULL,
	"donor_name" varchar(100) NOT NULL,
	"phone_number" varchar(20),
	"amount" integer NOT NULL,
	"status" "donation_status" DEFAULT 'pending' NOT NULL,
	"reference" varchar(100),
	"is_public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "endorsements" (
	"id" serial PRIMARY KEY NOT NULL,
	"leader_id" integer NOT NULL,
	"kind" "endorsement_kind" NOT NULL,
	"author_name" varchar(100) NOT NULL,
	"author_role" varchar(100),
	"message" text,
	"ward" varchar(50),
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "leaders" ADD COLUMN "fundraising_goal" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pillars" ADD COLUMN "delivery_status" "delivery_status" DEFAULT 'promised' NOT NULL;--> statement-breakpoint
ALTER TABLE "pillars" ADD COLUMN "evidence" text;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_leader_id_leaders_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."leaders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endorsements" ADD CONSTRAINT "endorsements_leader_id_leaders_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."leaders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "donations_leader_idx" ON "donations" USING btree ("leader_id","status");--> statement-breakpoint
CREATE INDEX "endorsements_leader_idx" ON "endorsements" USING btree ("leader_id","kind");