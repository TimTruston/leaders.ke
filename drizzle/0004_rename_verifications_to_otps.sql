ALTER TABLE "verifications" RENAME TO "otps";--> statement-breakpoint
ALTER INDEX "verifications_destination_idx" RENAME TO "otps_destination_idx";
