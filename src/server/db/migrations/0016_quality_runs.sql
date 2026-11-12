ALTER TYPE "public"."job_kind" ADD VALUE 'quality_check';--> statement-breakpoint
CREATE TABLE "quality_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_by_user_id" uuid,
	"status" text DEFAULT 'running' NOT NULL,
	"plan" jsonb NOT NULL,
	"results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"report" jsonb,
	"finished_at" timestamp with time zone
);
