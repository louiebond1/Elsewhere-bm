CREATE TYPE "public"."ai_outcome" AS ENUM('succeeded', 'failed', 'refused', 'stale_discarded');--> statement-breakpoint
CREATE TYPE "public"."ai_provider" AS ENUM('fixture', 'anthropic');--> statement-breakpoint
CREATE TYPE "public"."alias_type" AS ENUM('name', 'domain');--> statement-breakpoint
CREATE TYPE "public"."anonymity_review" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."answer_status" AS ENUM('draft', 'submitted', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."assistance" AS ENUM('not_declared', 'candidate_declared_ai');--> statement-breakpoint
CREATE TYPE "public"."block_reason" AS ENUM('current_employer', 'candidate_choice');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('not_booked', 'booked', 'completed');--> statement-breakpoint
CREATE TYPE "public"."candidate_status" AS ENUM('onboarding', 'active', 'paused', 'deleting', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."client_status" AS ENUM('prospect', 'onboarding', 'active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."closure_reason" AS ENUM('filled', 'cancelled', 'on_hold', 'other');--> statement-breakpoint
CREATE TYPE "public"."confidence" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."consent_kind" AS ENUM('terms', 'ai_processing', 'discovery', 'aggregate_insights', 'screening_recording');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('draft', 'active', 'expired', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."conversation_kind" AS ENUM('initial_screening', 'check_in');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('active', 'paused', 'completed');--> statement-breakpoint
CREATE TYPE "public"."dataset_status" AS ENUM('active', 'resetting', 'archived', 'preparing');--> statement-breakpoint
CREATE TYPE "public"."eligibility" AS ENUM('eligible', 'needs_clarification', 'incompatible');--> statement-breakpoint
CREATE TYPE "public"."employer_resolution" AS ENUM('not_supplied', 'resolved', 'unresolved', 'not_employed');--> statement-breakpoint
CREATE TYPE "public"."evidence_review" AS ENUM('draft', 'candidate_approved', 'consultant_verified', 'rejected', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."evidence_source" AS ENUM('cv', 'answer', 'candidate_edit', 'screening');--> statement-breakpoint
CREATE TYPE "public"."evidence_strength" AS ENUM('specific', 'partial', 'assertion');--> statement-breakpoint
CREATE TYPE "public"."experience_band" AS ENUM('early_career', 'established', 'leadership', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."file_purpose" AS ENUM('cv', 'screening_recording');--> statement-breakpoint
CREATE TYPE "public"."hire_source" AS ENUM('in_system', 'outside_system', 'replacement');--> statement-breakpoint
CREATE TYPE "public"."hire_status" AS ENUM('confirmed', 'started', 'left');--> statement-breakpoint
CREATE TYPE "public"."hold_status" AS ENUM('active', 'released', 'consumed');--> statement-breakpoint
CREATE TYPE "public"."idem_state" AS ENUM('processing', 'completed');--> statement-breakpoint
CREATE TYPE "public"."importance" AS ENUM('essential', 'desirable');--> statement-breakpoint
CREATE TYPE "public"."input_mode" AS ENUM('text', 'imported_assisted');--> statement-breakpoint
CREATE TYPE "public"."intro_state" AS ENUM('pending', 'accepted', 'declined', 'expired', 'cancelled', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."job_kind" AS ENUM('extract_cv', 'ask_question', 'build_profile', 'assess_match', 'expire_intros', 'delete_candidate', 'reconcile_wallet', 'seed_demo');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('owner', 'hiring_manager');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('intro_requested', 'intro_accepted', 'intro_declined', 'screening_updated', 'profile_ready', 'credit_low', 'hire_recorded', 'replacement_updated', 'system');--> statement-breakpoint
CREATE TYPE "public"."order_kind" AS ENUM('primary', 'additional', 'replacement');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('quoted', 'deposit_paid', 'paid', 'no_hire_closed');--> statement-breakpoint
CREATE TYPE "public"."pipeline_stage" AS ENUM('introduced', 'interview', 'offer', 'hired', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."plan_type" AS ENUM('annual', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."profile_review" AS ENUM('draft', 'approved', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."question_state" AS ENUM('unanswered', 'answered', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."question_topic" AS ENUM('experience', 'ownership', 'outcome', 'collaboration', 'learning', 'constraints', 'clarification');--> statement-breakpoint
CREATE TYPE "public"."region" AS ENUM('london', 'hertfordshire', 'manchester', 'remote_uk');--> statement-breakpoint
CREATE TYPE "public"."replacement_eligibility" AS ENUM('eligible', 'outside_window', 'already_used', 'pending_review');--> statement-breakpoint
CREATE TYPE "public"."replacement_status" AS ENUM('requested', 'approved', 'declined', 'fulfilled');--> statement-breakpoint
CREATE TYPE "public"."reservation_state" AS ENUM('reserved', 'reconciled', 'released');--> statement-breakpoint
CREATE TYPE "public"."revocation_reason" AS ENUM('candidate_withdrew', 'employer_block', 'deletion');--> statement-breakpoint
CREATE TYPE "public"."role_family" AS ENUM('finance', 'operations', 'commercial');--> statement-breakpoint
CREATE TYPE "public"."role_status" AS ENUM('draft', 'open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."screening_status" AS ENUM('requested', 'scheduled', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."selection_mode" AS ENUM('manual', 'automatic');--> statement-breakpoint
CREATE TYPE "public"."service_mode" AS ENUM('standard', 'full_search');--> statement-breakpoint
CREATE TYPE "public"."training_mode" AS ENUM('online', 'in_person');--> statement-breakpoint
CREATE TYPE "public"."tx_type" AS ENUM('grant', 'deposit_debit', 'hire_balance_debit', 'second_hire_debit', 'outside_hire_debit', 'reversal');--> statement-breakpoint
CREATE TYPE "public"."upload_state" AS ENUM('uploaded', 'processing', 'ready', 'failed', 'deleting', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'disabled', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."user_type" AS ENUM('candidate', 'client', 'consultant');--> statement-breakpoint
CREATE TYPE "public"."work_authorisation" AS ENUM('confirmed', 'needs_discussion', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."work_category" AS ENUM('training', 'screening', 'support', 'shortlisting', 'search', 'offer', 'admin');--> statement-breakpoint
CREATE TYPE "public"."work_mode" AS ENUM('onsite', 'hybrid', 'remote');--> statement-breakpoint
CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"client_id" uuid,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"action" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"operation_id" uuid,
	"event_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_budget_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"request_key" text NOT NULL,
	"utc_date" date NOT NULL,
	"reserved_tokens" integer NOT NULL,
	"actual_tokens" integer,
	"state" "reservation_state" DEFAULT 'reserved' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ai_budget_reservations_request_key_unique" UNIQUE("request_key")
);
--> statement-breakpoint
CREATE TABLE "ai_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"job_id" uuid,
	"user_id" uuid,
	"candidate_id" uuid,
	"role_id" uuid,
	"task" text NOT NULL,
	"provider" "ai_provider" NOT NULL,
	"model_id" text NOT NULL,
	"prompt_version" text NOT NULL,
	"input_hash" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"outcome" "ai_outcome" NOT NULL,
	"error_code" text
);
--> statement-breakpoint
CREATE TABLE "application_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"active_dataset_id" uuid,
	"reset_job_id" uuid,
	"maintenance" boolean DEFAULT false NOT NULL,
	"last_reset_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"candidate_id" uuid NOT NULL,
	"organisation_id" uuid NOT NULL,
	"include_group" boolean DEFAULT true NOT NULL,
	"reason" "block_reason" NOT NULL,
	"created_by_user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_identity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"candidate_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"current_employer_label" text,
	"current_title" text,
	CONSTRAINT "candidate_identity_candidate_id_unique" UNIQUE("candidate_id")
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"user_id" uuid NOT NULL,
	"public_ref" text NOT NULL,
	"status" "candidate_status" DEFAULT 'onboarding' NOT NULL,
	"discovery_enabled" boolean DEFAULT false NOT NULL,
	"employer_resolution_status" "employer_resolution" DEFAULT 'not_supplied' NOT NULL,
	"current_organisation_id" uuid,
	"preferred_role_families" text[] DEFAULT '{}'::text[] NOT NULL,
	"region" "region" DEFAULT 'london' NOT NULL,
	"work_modes" text[] DEFAULT '{}'::text[] NOT NULL,
	"min_salary_pence" bigint,
	"notice_weeks" integer,
	"work_authorisation" "work_authorisation" DEFAULT 'unknown' NOT NULL,
	"experience_band" "experience_band" DEFAULT 'unknown' NOT NULL,
	"latest_profile_version_id" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "candidates_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "check_in_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"question_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"body" text NOT NULL,
	"input_mode" "input_mode" DEFAULT 'text' NOT NULL,
	"assistance" "assistance" DEFAULT 'not_declared' NOT NULL,
	"status" "answer_status" DEFAULT 'submitted' NOT NULL,
	"submitted_at" timestamp with time zone,
	"replaces_answer_id" uuid
);
--> statement-breakpoint
CREATE TABLE "check_in_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"conversation_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"question_text" text NOT NULL,
	"topic" "question_topic" NOT NULL,
	"reason" text,
	"target_evidence_id" uuid,
	"state" "question_state" DEFAULT 'unanswered' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"client_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"membership_role" "membership_role" DEFAULT 'owner' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_onboarding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"client_id" uuid NOT NULL,
	"intro_status" "booking_status" DEFAULT 'not_booked' NOT NULL,
	"training_mode" "training_mode",
	"training_status" "booking_status" DEFAULT 'not_booked' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"interview_training_done" boolean DEFAULT false NOT NULL,
	"process_design_done" boolean DEFAULT false NOT NULL,
	"job_specs_done" boolean DEFAULT false NOT NULL,
	"assessment_training_done" boolean DEFAULT false NOT NULL,
	"hiring_brief" text,
	CONSTRAINT "client_onboarding_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"organisation_id" uuid NOT NULL,
	"consultant_user_id" uuid NOT NULL,
	"contact_name" text NOT NULL,
	"contact_email" text NOT NULL,
	"status" "client_status" DEFAULT 'onboarding' NOT NULL,
	"existing_fee_bps" integer,
	"notes_private" text,
	CONSTRAINT "clients_organisation_id_unique" UNIQUE("organisation_id")
);
--> statement-breakpoint
CREATE TABLE "consent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"kind" "consent_kind" NOT NULL,
	"granted" boolean NOT NULL,
	"terms_version" text NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"related_screening_id" uuid,
	"event_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"client_id" uuid NOT NULL,
	"plan_type" "plan_type" NOT NULL,
	"status" "contract_status" DEFAULT 'draft' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"credit_rate_pence" integer,
	"included_open_roles" integer NOT NULL,
	"committed_credit_units" bigint NOT NULL,
	"instalment_count" integer DEFAULT 1 NOT NULL,
	"pricing_version" text NOT NULL,
	"terms_snapshot" jsonb,
	"exclusivity_note" text DEFAULT 'To be agreed' NOT NULL,
	"rollover_note" text DEFAULT 'To be agreed' NOT NULL,
	"label" text,
	"activated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"candidate_id" uuid NOT NULL,
	"kind" "conversation_kind" NOT NULL,
	"status" "conversation_status" DEFAULT 'active' NOT NULL,
	"initial_cv_file_id" uuid,
	"question_count" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"provider" "ai_provider" NOT NULL,
	"prompt_version" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"wallet_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"units" bigint NOT NULL,
	"status" "hold_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_by_transaction_id" uuid
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seq" bigserial NOT NULL,
	"wallet_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"order_id" uuid,
	"role_id" uuid,
	"hire_id" uuid,
	"type" "tx_type" NOT NULL,
	"delta_units" bigint NOT NULL,
	"valuation_rate_pence" integer NOT NULL,
	"delta_pence" bigint NOT NULL,
	"actor_user_id" uuid,
	"operation_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"reversal_of_id" uuid,
	"reason" text NOT NULL,
	"business_event_at" timestamp with time zone NOT NULL,
	"balance_after_units" bigint NOT NULL,
	CONSTRAINT "credit_transactions_reversal_of_id_unique" UNIQUE("reversal_of_id")
);
--> statement-breakpoint
CREATE TABLE "datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"seed_version" text,
	"scenario_code" text,
	"business_now" timestamp with time zone,
	"status" "dataset_status" DEFAULT 'preparing' NOT NULL,
	"is_demo" boolean DEFAULT true NOT NULL,
	"generation" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demo_access_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"csrf_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "demo_access_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "evidence_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"candidate_id" uuid NOT NULL,
	"source_kind" "evidence_source" NOT NULL,
	"source_file_id" uuid,
	"source_answer_id" uuid,
	"source_screening_id" uuid,
	"source_quote_private" text NOT NULL,
	"claim_private" text NOT NULL,
	"safe_claim" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"outcome_text" text,
	"uncertainty" text,
	"strength" "evidence_strength" NOT NULL,
	"review_state" "evidence_review" DEFAULT 'draft' NOT NULL,
	"anonymity_review" "anonymity_review" DEFAULT 'pending' NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"supersedes_id" uuid,
	"provider" "ai_provider" DEFAULT 'fixture' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"candidate_id" uuid,
	"screening_id" uuid,
	"purpose" "file_purpose" NOT NULL,
	"object_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"upload_state" "upload_state" DEFAULT 'uploaded' NOT NULL,
	"extracted_text_private" text,
	"extraction_error_code" text,
	"text_confirmed_at" timestamp with time zone,
	"uploaded_by_user_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "files_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
CREATE TABLE "hire_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"client_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"order_number" integer NOT NULL,
	"kind" "order_kind" NOT NULL,
	"service_mode" "service_mode" NOT NULL,
	"salary_snapshot_pence" bigint NOT NULL,
	"base_units" bigint NOT NULL,
	"total_units" bigint NOT NULL,
	"deposit_due_units" bigint NOT NULL,
	"rate_snapshot_pence" integer NOT NULL,
	"total_pence" bigint NOT NULL,
	"pricing_version" text NOT NULL,
	"status" "order_status" DEFAULT 'quoted' NOT NULL,
	"parent_paid_order_id" uuid
);
--> statement-breakpoint
CREATE TABLE "hires" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"client_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"candidate_id" uuid,
	"introduction_id" uuid,
	"order_id" uuid NOT NULL,
	"source" "hire_source" NOT NULL,
	"agreed_salary_pence" bigint NOT NULL,
	"accepted_offer_date" date NOT NULL,
	"start_date" date NOT NULL,
	"status" "hire_status" DEFAULT 'confirmed' NOT NULL,
	"left_date" date,
	"left_reason" text,
	"created_by_user_id" uuid NOT NULL,
	"duplicate_key" text NOT NULL,
	"candidate_ref_snapshot" text NOT NULL,
	"outside_intro_id" uuid,
	CONSTRAINT "hires_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"actor_scope" text NOT NULL,
	"endpoint" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer,
	"response_body_safe" jsonb,
	"state" "idem_state" DEFAULT 'processing' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"introduction_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"granted_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revocation_reason" "revocation_reason",
	CONSTRAINT "identity_grants_introduction_id_unique" UNIQUE("introduction_id")
);
--> statement-breakpoint
CREATE TABLE "introductions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"role_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"state" "intro_state" DEFAULT 'pending' NOT NULL,
	"message_to_candidate" text DEFAULT '' NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"accepted_profile_version_id" uuid,
	"attempt_count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"kind" "job_kind" NOT NULL,
	"subject_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_by" text,
	"locked_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"error_code" text
);
--> statement-breakpoint
CREATE TABLE "local_objects" (
	"object_key" text PRIMARY KEY NOT NULL,
	"bytes_b64" text NOT NULL,
	"content_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"role_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"profile_version_id" uuid NOT NULL,
	"role_version" integer NOT NULL,
	"eligibility" "eligibility" NOT NULL,
	"incompatibility_reason" text,
	"score" integer NOT NULL,
	"ai_score" integer DEFAULT 0 NOT NULL,
	"human_score" integer,
	"coverage_bps" integer DEFAULT 0 NOT NULL,
	"confidence" "confidence" NOT NULL,
	"criterion_results" jsonb NOT NULL,
	"rationale_safe" text NOT NULL,
	"missing_evidence" text[] DEFAULT '{}'::text[] NOT NULL,
	"ai_run_id" uuid,
	"provider" "ai_provider" DEFAULT 'fixture' NOT NULL,
	"stale" boolean DEFAULT false NOT NULL,
	"computed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"subject_ref_type" text NOT NULL,
	"subject_ref_id" uuid NOT NULL,
	"safe_title" text NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "organisation_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"organisation_id" uuid NOT NULL,
	"alias_normalized" text NOT NULL,
	"alias_type" "alias_type" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"legal_name" text NOT NULL,
	"display_name" text NOT NULL,
	"canonical_domain" text,
	"group_id" uuid,
	"is_client" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"introduction_id" uuid NOT NULL,
	"stage" "pipeline_stage" DEFAULT 'introduced' NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"next_action" text,
	"next_action_due" date,
	"client_note" text,
	"interview_prep" jsonb,
	CONSTRAINT "pipeline_entries_introduction_id_unique" UNIQUE("introduction_id")
);
--> statement-breakpoint
CREATE TABLE "profile_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"candidate_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"headline_safe" text NOT NULL,
	"summary_safe" text NOT NULL,
	"preferences_snapshot" jsonb NOT NULL,
	"evidence_ids" uuid[] NOT NULL,
	"feedback" jsonb NOT NULL,
	"review_state" "profile_review" DEFAULT 'draft' NOT NULL,
	"approval_at" timestamp with time zone,
	"profile_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ranking_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"role_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"consultant_user_id" uuid NOT NULL,
	"adjustment" integer NOT NULL,
	"reason_private" text NOT NULL,
	"evidence_ids" uuid[] NOT NULL,
	"supersedes_id" uuid
);
--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"scope_hash" text NOT NULL,
	"action" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replacement_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"original_hire_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"left_date" date NOT NULL,
	"reason" text NOT NULL,
	"eligibility" "replacement_eligibility" NOT NULL,
	"status" "replacement_status" DEFAULT 'requested' NOT NULL,
	"decision_by_user_id" uuid,
	"decision_at" timestamp with time zone,
	"replacement_role_id" uuid,
	"replacement_hire_id" uuid,
	CONSTRAINT "replacement_cases_original_hire_id_unique" UNIQUE("original_hire_id"),
	CONSTRAINT "replacement_cases_replacement_role_id_unique" UNIQUE("replacement_role_id"),
	CONSTRAINT "replacement_cases_replacement_hire_id_unique" UNIQUE("replacement_hire_id")
);
--> statement-breakpoint
CREATE TABLE "role_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"role_id" uuid NOT NULL,
	"criterion_key" text NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL,
	"importance" "importance" NOT NULL,
	"weight" integer NOT NULL,
	"evidence_tags" text[] NOT NULL,
	"ordinal" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"client_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"vacancy_key" text NOT NULL,
	"title" text NOT NULL,
	"role_family" "role_family" NOT NULL,
	"location_region" "region" NOT NULL,
	"work_mode" "work_mode" NOT NULL,
	"salary_pence" bigint NOT NULL,
	"work_authorisation_required" boolean DEFAULT true NOT NULL,
	"brief_text" text DEFAULT '' NOT NULL,
	"outcomes" text[] DEFAULT '{}'::text[] NOT NULL,
	"teachable_skills" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "role_status" DEFAULT 'draft' NOT NULL,
	"closure_reason" "closure_reason",
	"closed_at" timestamp with time zone,
	"assigned_consultant_id" uuid NOT NULL,
	"role_version" integer DEFAULT 1 NOT NULL,
	"pricing_locked_at" timestamp with time zone,
	"is_extra_role" boolean DEFAULT false NOT NULL,
	"is_replacement_role" boolean DEFAULT false NOT NULL,
	"replacement_case_id" uuid,
	"default_service_mode" "service_mode" DEFAULT 'standard' NOT NULL,
	"duplicate_of_role_id" uuid,
	"new_vacancy_confirmed_by" uuid,
	"new_vacancy_reason" text,
	"external_ats_id" text,
	"created_by_user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screenings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"role_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"consultant_user_id" uuid,
	"selection_mode" "selection_mode" DEFAULT 'manual' NOT NULL,
	"status" "screening_status" DEFAULT 'requested' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"recording_consent_at" timestamp with time zone,
	"notes_private" text,
	"summary_safe" text,
	"criterion_assessments" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"csrf_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"demo_gate_verified" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"email_normalized" text NOT NULL,
	"password_hash" text NOT NULL,
	"user_type" "user_type" NOT NULL,
	"display_name" text,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"client_id" uuid NOT NULL,
	"available_cached_units" bigint DEFAULT 0 NOT NULL,
	"last_reconciled_at" timestamp with time zone,
	CONSTRAINT "wallets_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "work_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"consultant_user_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"role_id" uuid,
	"screening_id" uuid,
	"category" "work_category" NOT NULL,
	"minutes" integer NOT NULL,
	"work_date" date NOT NULL,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_state" ADD CONSTRAINT "application_state_active_dataset_id_datasets_id_fk" FOREIGN KEY ("active_dataset_id") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_blocks" ADD CONSTRAINT "candidate_blocks_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_blocks" ADD CONSTRAINT "candidate_blocks_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_blocks" ADD CONSTRAINT "candidate_blocks_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_blocks" ADD CONSTRAINT "candidate_blocks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_identity" ADD CONSTRAINT "candidate_identity_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_identity" ADD CONSTRAINT "candidate_identity_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_current_organisation_id_organisations_id_fk" FOREIGN KEY ("current_organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in_answers" ADD CONSTRAINT "check_in_answers_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in_answers" ADD CONSTRAINT "check_in_answers_question_id_check_in_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."check_in_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in_answers" ADD CONSTRAINT "check_in_answers_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in_questions" ADD CONSTRAINT "check_in_questions_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in_questions" ADD CONSTRAINT "check_in_questions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_memberships" ADD CONSTRAINT "client_memberships_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_memberships" ADD CONSTRAINT "client_memberships_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_memberships" ADD CONSTRAINT "client_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_onboarding" ADD CONSTRAINT "client_onboarding_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_onboarding" ADD CONSTRAINT "client_onboarding_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_consultant_user_id_users_id_fk" FOREIGN KEY ("consultant_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_holds" ADD CONSTRAINT "credit_holds_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_holds" ADD CONSTRAINT "credit_holds_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_holds" ADD CONSTRAINT "credit_holds_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_holds" ADD CONSTRAINT "credit_holds_order_id_hire_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."hire_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_order_id_hire_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."hire_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hire_orders" ADD CONSTRAINT "hire_orders_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hire_orders" ADD CONSTRAINT "hire_orders_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hire_orders" ADD CONSTRAINT "hire_orders_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hire_orders" ADD CONSTRAINT "hire_orders_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hires" ADD CONSTRAINT "hires_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hires" ADD CONSTRAINT "hires_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hires" ADD CONSTRAINT "hires_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hires" ADD CONSTRAINT "hires_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hires" ADD CONSTRAINT "hires_order_id_hire_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."hire_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_grants" ADD CONSTRAINT "identity_grants_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_grants" ADD CONSTRAINT "identity_grants_introduction_id_introductions_id_fk" FOREIGN KEY ("introduction_id") REFERENCES "public"."introductions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_grants" ADD CONSTRAINT "identity_grants_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_grants" ADD CONSTRAINT "identity_grants_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_grants" ADD CONSTRAINT "identity_grants_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "introductions" ADD CONSTRAINT "introductions_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "introductions" ADD CONSTRAINT "introductions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "introductions" ADD CONSTRAINT "introductions_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "introductions" ADD CONSTRAINT "introductions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisation_aliases" ADD CONSTRAINT "organisation_aliases_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisation_aliases" ADD CONSTRAINT "organisation_aliases_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_entries" ADD CONSTRAINT "pipeline_entries_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_entries" ADD CONSTRAINT "pipeline_entries_introduction_id_introductions_id_fk" FOREIGN KEY ("introduction_id") REFERENCES "public"."introductions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_versions" ADD CONSTRAINT "profile_versions_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_versions" ADD CONSTRAINT "profile_versions_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_adjustments" ADD CONSTRAINT "ranking_adjustments_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_adjustments" ADD CONSTRAINT "ranking_adjustments_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_adjustments" ADD CONSTRAINT "ranking_adjustments_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replacement_cases" ADD CONSTRAINT "replacement_cases_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replacement_cases" ADD CONSTRAINT "replacement_cases_original_hire_id_hires_id_fk" FOREIGN KEY ("original_hire_id") REFERENCES "public"."hires"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replacement_cases" ADD CONSTRAINT "replacement_cases_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_criteria" ADD CONSTRAINT "role_criteria_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_criteria" ADD CONSTRAINT "role_criteria_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_assigned_consultant_id_users_id_fk" FOREIGN KEY ("assigned_consultant_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screenings" ADD CONSTRAINT "screenings_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screenings" ADD CONSTRAINT "screenings_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screenings" ADD CONSTRAINT "screenings_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_subject_idx" ON "activity_events" USING btree ("subject_type","subject_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "block_uq" ON "candidate_blocks" USING btree ("candidate_id","organisation_id");--> statement-breakpoint
CREATE INDEX "block_idx" ON "candidate_blocks" USING btree ("candidate_id","organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_ref_uq" ON "candidates" USING btree ("dataset_id","public_ref");--> statement-breakpoint
CREATE INDEX "answers_cand_idx" ON "check_in_answers" USING btree ("candidate_id","submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "one_submitted_answer" ON "check_in_answers" USING btree ("question_id") WHERE status = 'submitted';--> statement-breakpoint
CREATE UNIQUE INDEX "question_ordinal_uq" ON "check_in_questions" USING btree ("conversation_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_user_uq" ON "client_memberships" USING btree ("dataset_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_contract" ON "contracts" USING btree ("client_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "contracts_client_idx" ON "contracts" USING btree ("client_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_conversation" ON "conversations" USING btree ("candidate_id","kind") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_hold_per_role" ON "credit_holds" USING btree ("role_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "holds_wallet_idx" ON "credit_holds" USING btree ("wallet_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "tx_idem_uq" ON "credit_transactions" USING btree ("dataset_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "tx_wallet_idx" ON "credit_transactions" USING btree ("wallet_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "one_deposit_per_order" ON "credit_transactions" USING btree ("order_id") WHERE type = 'deposit_debit' and reversal_of_id is null;--> statement-breakpoint
CREATE INDEX "evidence_cand_idx" ON "evidence_items" USING btree ("candidate_id","review_state");--> statement-breakpoint
CREATE INDEX "files_cand_idx" ON "files" USING btree ("candidate_id","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "order_number_uq" ON "hire_orders" USING btree ("role_id","order_number");--> statement-breakpoint
CREATE UNIQUE INDEX "hire_dup_uq" ON "hires" USING btree ("dataset_id","duplicate_key");--> statement-breakpoint
CREATE UNIQUE INDEX "idem_uq" ON "idempotency_records" USING btree ("dataset_id","actor_scope","endpoint","key");--> statement-breakpoint
CREATE INDEX "grant_idx" ON "identity_grants" USING btree ("client_id","role_id","candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "intro_uq" ON "introductions" USING btree ("role_id","candidate_id");--> statement-breakpoint
CREATE INDEX "intro_role_idx" ON "introductions" USING btree ("role_id","state");--> statement-breakpoint
CREATE INDEX "intro_cand_idx" ON "introductions" USING btree ("candidate_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "job_dedupe_uq" ON "jobs" USING btree ("dataset_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "match_uq" ON "matches" USING btree ("role_id","candidate_id");--> statement-breakpoint
CREATE INDEX "match_score_idx" ON "matches" USING btree ("role_id","score");--> statement-breakpoint
CREATE INDEX "notif_idx" ON "notifications" USING btree ("recipient_user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "org_alias_uq" ON "organisation_aliases" USING btree ("dataset_id","alias_normalized","alias_type");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_version_uq" ON "profile_versions" USING btree ("candidate_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "rate_uq" ON "rate_limit_buckets" USING btree ("scope_hash","action","window_start");--> statement-breakpoint
CREATE UNIQUE INDEX "criterion_uq" ON "role_criteria" USING btree ("role_id","criterion_key");--> statement-breakpoint
CREATE UNIQUE INDEX "vacancy_uq" ON "roles" USING btree ("client_id","vacancy_key");--> statement-breakpoint
CREATE INDEX "roles_client_idx" ON "roles" USING btree ("client_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "screening_uq" ON "screenings" USING btree ("role_id","candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("dataset_id","email_normalized");