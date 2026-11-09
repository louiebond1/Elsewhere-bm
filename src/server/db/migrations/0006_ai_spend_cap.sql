CREATE TABLE "ai_spend" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"request_key" text NOT NULL,
	"utc_month" text NOT NULL,
	"task" text NOT NULL,
	"model_id" text NOT NULL,
	"reserved_micro_usd" bigint NOT NULL,
	"actual_micro_usd" bigint,
	"state" text DEFAULT 'reserved' NOT NULL,
	CONSTRAINT "ai_spend_request_key_unique" UNIQUE("request_key")
);
--> statement-breakpoint
CREATE INDEX "ai_spend_month_idx" ON "ai_spend" USING btree ("utc_month");--> statement-breakpoint
ALTER TABLE "ai_spend" ADD CONSTRAINT "ai_spend_state_ok" CHECK (state IN ('reserved', 'settled', 'unsettled'));--> statement-breakpoint
ALTER TABLE "ai_spend" ADD CONSTRAINT "ai_spend_amounts_ok" CHECK (reserved_micro_usd > 0 AND (actual_micro_usd IS NULL OR actual_micro_usd >= 0));
