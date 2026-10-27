ALTER TABLE "webhook_endpoints" ADD COLUMN "previous_secret_sealed" text;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD COLUMN "previous_secret_expires_at" timestamp with time zone;