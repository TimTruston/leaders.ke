ALTER TABLE "ambassadors" DROP CONSTRAINT "ambassadors_leader_id_leaders_id_fk";
--> statement-breakpoint
ALTER TABLE "ambassadors" ADD COLUMN "subject_user_id" integer;--> statement-breakpoint
UPDATE "ambassadors" a SET "subject_user_id" = l."user_id" FROM "leaders" l WHERE a."leader_id" = l."id";--> statement-breakpoint
ALTER TABLE "ambassadors" ALTER COLUMN "subject_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ambassadors" ADD CONSTRAINT "ambassadors_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambassadors" DROP COLUMN "leader_id";