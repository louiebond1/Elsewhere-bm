-- Integrity rules that must hold regardless of application code.
ALTER TABLE "credit_transactions" ADD CONSTRAINT "tx_delta_sign" CHECK (
  (type = 'grant' AND delta_units > 0) OR
  (type IN ('deposit_debit','hire_balance_debit','second_hire_debit','outside_hire_debit') AND delta_units < 0) OR
  (type = 'reversal' AND reversal_of_id IS NOT NULL)
);--> statement-breakpoint
ALTER TABLE "hire_orders" ADD CONSTRAINT "order_price_rules" CHECK (
  (kind = 'replacement' AND total_units = 0 AND total_pence = 0 AND deposit_due_units = 0) OR
  (kind IN ('primary','additional') AND total_units > 0 AND total_pence > 0)
);--> statement-breakpoint
ALTER TABLE "hire_orders" ADD CONSTRAINT "order_nonnegative" CHECK (base_units >= 0 AND total_units >= 0 AND deposit_due_units >= 0);--> statement-breakpoint
ALTER TABLE "credit_holds" ADD CONSTRAINT "hold_positive" CHECK (units > 0);--> statement-breakpoint
ALTER TABLE "role_criteria" ADD CONSTRAINT "criterion_weight" CHECK (weight BETWEEN 1 AND 5);--> statement-breakpoint
ALTER TABLE "ranking_adjustments" ADD CONSTRAINT "adjustment_bounds" CHECK (adjustment BETWEEN -10 AND 10);--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "match_score_bounds" CHECK (score BETWEEN 0 AND 100);--> statement-breakpoint
ALTER TABLE "work_logs" ADD CONSTRAINT "work_minutes_positive" CHECK (minutes > 0);--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "role_salary_positive" CHECK (salary_pence > 0 AND salary_pence <= 100000000);--> statement-breakpoint
CREATE OR REPLACE FUNCTION forbid_ledger_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'credit_transactions is append-only'; END IF;
  -- Deletes are only permitted as part of purging an entire demo dataset.
  IF TG_OP = 'DELETE' AND EXISTS (SELECT 1 FROM datasets d WHERE d.id = OLD.dataset_id) THEN
    IF current_setting('bm.allow_dataset_purge', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'credit_transactions is append-only';
    END IF;
  END IF;
  RETURN OLD;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER credit_transactions_append_only BEFORE UPDATE OR DELETE ON "credit_transactions" FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();
