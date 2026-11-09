ALTER TYPE "public"."job_kind" ADD VALUE 'simulate_interviews';--> statement-breakpoint
CREATE TABLE "simulated_interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"role_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"role_version" integer NOT NULL,
	"profile_version_id" uuid NOT NULL,
	"answers" jsonb NOT NULL,
	"fit_score" integer NOT NULL,
	"summary_safe" text NOT NULL,
	"concerns_safe" text[] DEFAULT '{}'::text[] NOT NULL,
	"provider" "ai_provider" DEFAULT 'fixture' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "simulated_interviews" ADD CONSTRAINT "simulated_interviews_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulated_interviews" ADD CONSTRAINT "simulated_interviews_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulated_interviews" ADD CONSTRAINT "simulated_interviews_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sim_interview_uq" ON "simulated_interviews" USING btree ("role_id","candidate_id");--> statement-breakpoint
CREATE INDEX "sim_interview_rank_idx" ON "simulated_interviews" USING btree ("role_id","fit_score");--> statement-breakpoint
ALTER TABLE "simulated_interviews" ADD CONSTRAINT "sim_fit_range" CHECK (fit_score BETWEEN 0 AND 100);
