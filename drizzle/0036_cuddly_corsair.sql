CREATE TABLE "password_reset_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"destination" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "password_reset_requests_destination_idx" ON "password_reset_requests" USING btree ("destination");