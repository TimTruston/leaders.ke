CREATE TABLE "pledges" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"leader_id" integer NOT NULL,
	"public" boolean DEFAULT false NOT NULL,
	"pillar_id" integer,
	"rating" integer NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"message" text NOT NULL,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "endorsements" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "endorsements" CASCADE;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "review_id" integer;--> statement-breakpoint
ALTER TABLE "pledges" ADD CONSTRAINT "pledges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pledges" ADD CONSTRAINT "pledges_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_leader_id_leaders_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."leaders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_pillar_id_pillars_id_fk" FOREIGN KEY ("pillar_id") REFERENCES "public"."pillars"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_pledge_per_campaign" ON "pledges" USING btree ("user_id","campaign_id") WHERE "pledges"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "reviews_leader_idx" ON "reviews" USING btree ("leader_id");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
DROP TYPE "public"."endorsement_kind";