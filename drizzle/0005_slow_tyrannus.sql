CREATE TABLE "ballot_simulations" (
	"id" serial PRIMARY KEY NOT NULL,
	"public_id" varchar(12) NOT NULL,
	"county" varchar(100) NOT NULL,
	"constituency" varchar(100) NOT NULL,
	"ward" varchar(100) NOT NULL,
	"polling_station" varchar(150),
	"selections" jsonb NOT NULL,
	"voter_name" varchar(100),
	"voter_contact" varchar(100),
	"consented_to_contact" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ballot_simulations_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "otps" DROP CONSTRAINT "verifications_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "otps" ADD CONSTRAINT "otps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;