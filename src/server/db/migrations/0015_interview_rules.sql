ALTER TABLE "candidates" ADD COLUMN "over_18" boolean;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "role_family_non_negotiable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "requires_18" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "simulated_interviews" ADD COLUMN "score_card" jsonb;