CREATE TABLE "scoring_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"client_id" uuid NOT NULL,
	"role_id" uuid,
	"candidate_id" uuid,
	"kind" text NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"other_answer" text,
	"ai_score" integer,
	"human_score" integer,
	"reason" text DEFAULT '' NOT NULL,
	"created_by_user_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "guidance_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "simulated_interviews" ADD COLUMN "guidance_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scoring_feedback" ADD CONSTRAINT "scoring_feedback_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_feedback" ADD CONSTRAINT "scoring_feedback_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_feedback" ADD CONSTRAINT "scoring_feedback_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_feedback" ADD CONSTRAINT "scoring_feedback_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_feedback" ADD CONSTRAINT "scoring_feedback_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scoring_feedback_role_idx" ON "scoring_feedback" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "scoring_feedback_client_idx" ON "scoring_feedback" USING btree ("client_id");