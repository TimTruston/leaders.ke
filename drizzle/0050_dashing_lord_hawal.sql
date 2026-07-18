ALTER TABLE "posts" DROP CONSTRAINT "posts_leader_id_leaders_id_fk";
--> statement-breakpoint
ALTER TABLE "tags" DROP CONSTRAINT "tags_leader_id_leaders_id_fk";
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "subject_user_id" integer;--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "subject_user_id" integer;--> statement-breakpoint
UPDATE "posts" SET "subject_user_id" = "leaders"."user_id" FROM "leaders" WHERE "posts"."leader_id" = "leaders"."id";--> statement-breakpoint
UPDATE "tags" SET "subject_user_id" = "leaders"."user_id" FROM "leaders" WHERE "tags"."leader_id" = "leaders"."id";--> statement-breakpoint
ALTER TABLE "tags" ALTER COLUMN "subject_user_id" SET NOT NULL;--> statement-breakpoint
UPDATE "followers" SET "deleted_at" = now() WHERE "id" IN (SELECT f."id" FROM "followers" f JOIN "leaders" l ON f."digest_id" = l."id" JOIN (SELECT f2."user_id" AS uid, l2."user_id" AS person, min(f2."id") AS keep FROM "followers" f2 JOIN "leaders" l2 ON f2."digest_id" = l2."id" WHERE f2."digest" = 'leader' AND f2."deleted_at" IS NULL GROUP BY f2."user_id", l2."user_id" HAVING count(*) > 1) d ON d.uid = f."user_id" AND d.person = l."user_id" AND f."id" <> d.keep WHERE f."digest" = 'leader' AND f."deleted_at" IS NULL);--> statement-breakpoint
UPDATE "followers" SET "digest_id" = "leaders"."user_id" FROM "leaders" WHERE "followers"."digest" = 'leader' AND "followers"."digest_id" = "leaders"."id";--> statement-breakpoint
UPDATE "conversations" SET "scope_id" = "leaders"."user_id" FROM "leaders" WHERE "conversations"."scope" = 'leader' AND "conversations"."scope_id" = "leaders"."id";--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" DROP COLUMN "leader_id";--> statement-breakpoint
ALTER TABLE "tags" DROP COLUMN "leader_id";
