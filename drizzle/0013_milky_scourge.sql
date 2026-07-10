ALTER TABLE "alliances" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "leaders" ALTER COLUMN "description" SET DATA TYPE varchar(255);