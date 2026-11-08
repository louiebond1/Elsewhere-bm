CREATE TYPE "public"."email_status" AS ENUM('queued', 'recorded', 'sent', 'suppressed', 'failed');--> statement-breakpoint
ALTER TYPE "public"."job_kind" ADD VALUE 'send_email';--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"notification_type" "notification_type" NOT NULL,
	"subject" text NOT NULL,
	"link_path" text NOT NULL,
	"status" "email_status" DEFAULT 'queued' NOT NULL,
	"driver" text,
	"provider_message_id" text,
	"suppressed_reason" text,
	"last_error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_outbox_created_idx" ON "email_outbox" USING btree ("dataset_id","created_at");