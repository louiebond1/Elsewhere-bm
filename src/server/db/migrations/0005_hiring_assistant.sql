CREATE TYPE "public"."hiring_conversation_status" AS ENUM('active', 'saved', 'abandoned');--> statement-breakpoint
CREATE TABLE "hiring_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"client_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "hiring_conversation_status" DEFAULT 'active' NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"understanding" jsonb NOT NULL,
	"last_asked" text,
	"provider" text NOT NULL,
	"role_id" uuid
);
--> statement-breakpoint
CREATE TABLE "hiring_manager_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"client_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"facts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"defaults" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"roles_created" integer DEFAULT 0 NOT NULL,
	"last_role_title" text
);
--> statement-breakpoint
ALTER TABLE "hiring_conversations" ADD CONSTRAINT "hiring_conversations_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring_conversations" ADD CONSTRAINT "hiring_conversations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring_conversations" ADD CONSTRAINT "hiring_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring_conversations" ADD CONSTRAINT "hiring_conversations_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring_manager_memory" ADD CONSTRAINT "hiring_manager_memory_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring_manager_memory" ADD CONSTRAINT "hiring_manager_memory_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring_manager_memory" ADD CONSTRAINT "hiring_manager_memory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hiring_conv_user_idx" ON "hiring_conversations" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "hiring_memory_user_uq" ON "hiring_manager_memory" USING btree ("dataset_id","user_id");