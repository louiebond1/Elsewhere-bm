ALTER TYPE "public"."notification_type" ADD VALUE 'welcome';--> statement-breakpoint
CREATE TABLE "onboarding_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"candidate_id" uuid NOT NULL,
	"question_key" text NOT NULL,
	"answer" text NOT NULL,
	"source" text NOT NULL,
	"ai_provider" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"approved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "onboarding_answers" ADD CONSTRAINT "onboarding_answers_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_answers" ADD CONSTRAINT "onboarding_answers_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_answer_once" ON "onboarding_answers" USING btree ("candidate_id","question_key");