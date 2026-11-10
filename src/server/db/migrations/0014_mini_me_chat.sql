CREATE TABLE "mini_me_chat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"candidate_id" uuid NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"asked_key" text
);
--> statement-breakpoint
ALTER TABLE "mini_me_chat" ADD CONSTRAINT "mini_me_chat_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mini_me_chat" ADD CONSTRAINT "mini_me_chat_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mini_me_chat_idx" ON "mini_me_chat" USING btree ("candidate_id","created_at");