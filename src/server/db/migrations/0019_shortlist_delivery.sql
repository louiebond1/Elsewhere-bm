ALTER TYPE "public"."consent_kind" ADD VALUE 'screening_job';--> statement-breakpoint
ALTER TYPE "public"."job_kind" ADD VALUE 'shortlist_tick';--> statement-breakpoint
ALTER TYPE "public"."screening_status" ADD VALUE 'invited';--> statement-breakpoint
ALTER TYPE "public"."screening_status" ADD VALUE 'accepted';--> statement-breakpoint
ALTER TYPE "public"."screening_status" ADD VALUE 'declined';--> statement-breakpoint
ALTER TYPE "public"."screening_status" ADD VALUE 'expired';--> statement-breakpoint
CREATE TABLE "shortlist_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"role_id" uuid NOT NULL,
	"role_version" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"cutoff_at" timestamp with time zone NOT NULL,
	"publish_at" timestamp with time zone NOT NULL,
	"force_publish_at" timestamp with time zone NOT NULL,
	"next_update_at" timestamp with time zone NOT NULL,
	"criteria" jsonb NOT NULL,
	"role_snapshot" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shortlist_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"cycle_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"notified_at" timestamp with time zone NOT NULL,
	"window_ends_at" timestamp with time zone NOT NULL,
	"notification_id" uuid,
	"review_state" text DEFAULT 'pending' NOT NULL,
	"review_reason" text,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "shortlist_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"member_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"assessment" jsonb,
	"interview" jsonb,
	"provider" text,
	"failure" text,
	"attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shortlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"role_id" uuid NOT NULL,
	"cycle_id" uuid,
	"version" integer NOT NULL,
	"kind" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"cutoff_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"scoring_version" text NOT NULL,
	"prompt_version" text NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "shortlist_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "screenings" ADD COLUMN "invited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "screenings" ADD COLUMN "invite_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "screenings" ADD COLUMN "responded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "screenings" ADD COLUMN "outcome" text;--> statement-breakpoint
ALTER TABLE "screenings" ADD COLUMN "dispute_reason" text;--> statement-breakpoint
ALTER TABLE "shortlist_cycles" ADD CONSTRAINT "shortlist_cycles_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_cycles" ADD CONSTRAINT "shortlist_cycles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_members" ADD CONSTRAINT "shortlist_members_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_members" ADD CONSTRAINT "shortlist_members_cycle_id_shortlist_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."shortlist_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_members" ADD CONSTRAINT "shortlist_members_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_revisions" ADD CONSTRAINT "shortlist_revisions_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_revisions" ADD CONSTRAINT "shortlist_revisions_member_id_shortlist_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."shortlist_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_revisions" ADD CONSTRAINT "shortlist_revisions_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_cycle_id_shortlist_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."shortlist_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shortlist_cycle_role_version" ON "shortlist_cycles" USING btree ("role_id","role_version");--> statement-breakpoint
CREATE UNIQUE INDEX "shortlist_member_uq" ON "shortlist_members" USING btree ("cycle_id","candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shortlist_revision_uq" ON "shortlist_revisions" USING btree ("member_id","fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "shortlist_publication_uq" ON "shortlists" USING btree ("role_id","version");