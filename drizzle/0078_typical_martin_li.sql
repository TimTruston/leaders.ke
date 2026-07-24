CREATE TABLE "ai_ask_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"anon_id" varchar(32),
	"ip_address" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_ask_events_anon_idx" ON "ai_ask_events" USING btree ("anon_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_ask_events_ip_idx" ON "ai_ask_events" USING btree ("ip_address","created_at");