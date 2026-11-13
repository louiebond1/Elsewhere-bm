ALTER TABLE "matches" ADD COLUMN "assessment_version" text;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "rubric_approved_version" integer DEFAULT 0 NOT NULL;