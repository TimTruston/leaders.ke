CREATE TABLE "pillar_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"position_title" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "pillar_templates_position_idx" ON "pillar_templates" USING btree ("position_title");