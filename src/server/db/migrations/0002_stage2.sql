ALTER TYPE "public"."job_kind" ADD VALUE 'generate_feedback';--> statement-breakpoint
ALTER TABLE "profile_versions" ADD COLUMN "feedback_live" jsonb;