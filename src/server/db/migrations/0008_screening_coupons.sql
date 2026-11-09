ALTER TYPE "public"."screening_status" ADD VALUE 'returned';--> statement-breakpoint
ALTER TABLE "screenings" ADD COLUMN "returned_reason_safe" text;