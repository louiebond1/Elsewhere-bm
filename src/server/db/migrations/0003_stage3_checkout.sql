CREATE TYPE "public"."checkout_status" AS ENUM('open', 'succeeded', 'declined', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."tx_type" ADD VALUE 'simulated_purchase';--> statement-breakpoint
CREATE TABLE "simulated_checkouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"client_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"units" bigint NOT NULL,
	"rate_pence" integer NOT NULL,
	"total_pence" bigint NOT NULL,
	"status" "checkout_status" DEFAULT 'open' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"transaction_id" uuid,
	CONSTRAINT "simulated_checkouts_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
ALTER TABLE "simulated_checkouts" ADD CONSTRAINT "simulated_checkouts_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulated_checkouts" ADD CONSTRAINT "simulated_checkouts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulated_checkouts" ADD CONSTRAINT "simulated_checkouts_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkout_client_idx" ON "simulated_checkouts" USING btree ("client_id","created_at");--> statement-breakpoint
-- The new enum value cannot be used as an enum literal in the same transaction, so compare as text.
ALTER TABLE "credit_transactions" DROP CONSTRAINT "tx_delta_sign";--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "tx_delta_sign" CHECK (
  (type::text IN ('grant','simulated_purchase') AND delta_units > 0) OR
  (type::text IN ('deposit_debit','hire_balance_debit','second_hire_debit','outside_hire_debit') AND delta_units < 0) OR
  (type::text = 'reversal' AND reversal_of_id IS NOT NULL)
);--> statement-breakpoint
ALTER TABLE "simulated_checkouts" ADD CONSTRAINT "checkout_amounts_positive" CHECK (units > 0 AND rate_pence > 0 AND total_pence > 0);--> statement-breakpoint
ALTER TABLE "simulated_checkouts" ADD CONSTRAINT "checkout_resolution" CHECK (
  (status::text = 'open' AND transaction_id IS NULL AND resolved_at IS NULL) OR
  (status::text = 'succeeded' AND transaction_id IS NOT NULL AND resolved_at IS NOT NULL) OR
  (status::text IN ('declined','cancelled') AND transaction_id IS NULL AND resolved_at IS NOT NULL)
);
